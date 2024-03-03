const logger = require('./logger');
const fs = require('fs-extra');
const express = require('express');
const http = require('http');
const request = require('request');
const os = require('os');
const rimraf = require("rimraf");
const open = require('open');
const httpProxy = require('http-proxy');
const {
    exec
} = require('./exec');
const { readAndReplaceFileContent } = require('./utils');
const {VERSIONS, hasValidExpoVersion} = require('./requirements');
const axios = require('axios');
const { setupProject } = require('./project-sync.service');
//const openTerminal =  require('open-terminal').default;
const webPreviewPort = 19005;
let proxyPort = 19009;
let barcodePort = 19000;
let proxyUrl = `http://${getIpAddress()}:${proxyPort}`;
const loggerLabel = 'expo-launcher';
function installGlobalNpmPackage(package) {
    return exec('npm', ['install', '-g', package]);
}

var isWebPreview = false;
var useProxy = false;

function launchServiceProxy(projectDir, previewUrl) {
    const proxy =  httpProxy.createProxyServer({});
    const wmProjectDir = getWmProjectDir(projectDir);
    if (isWebPreview) {
        const app = express();
        app.use('/rn-bundle', express.static(wmProjectDir + '/rn-bundle'));
        app.get("*", (req, res) => {
            res.send(`
            <html>
                <head>
                    <script type="text/javascript">
                        location.href="/rn-bundle/index.html"
                    </script>
                </head>
            </html>`);
        });
        app.listen(webPreviewPort);
    }
    http.createServer(function (req, res) {
        try {
            let tUrl = req.url;
            if (req.url === '/' || req.url.startsWith('/rn-bundle')) {
                tUrl = `http://localhost:${webPreviewPort}${req.url}`;
                req.pipe(request(tUrl)).pipe(res);
            } else {
                proxy.web(req, res, {
                    target: previewUrl,
                    xfwd: false,
                    changeOrigin: true,
                    secure: false,
                    cookiePathRewrite: {
                        "*": ""
                    }
                });
                tUrl = `${previewUrl}/${req.url}`;
            }
        } catch(e) {
            res.writeHead(500);
            console.error(e);
        }
    }).listen(proxyPort);
    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        proxyReq.setHeader('sec-fetch-mode', 'no-cors');
        proxyReq.setHeader('origin', previewUrl);
        proxyReq.setHeader('referer', previewUrl);
    });
    proxy.on('proxyRes', function(proxyRes, req, res, options) {
        var cookies = proxyRes.headers['set-cookie'];
        if (cookies) {
            cookies = typeof cookies === 'string' ? [cookies] : cookies;
            cookies = cookies.map(c => c.replace(/;?\sSecure/, ''));
            proxyRes.headers['set-cookie'] = cookies;
        }
    });
    proxy.on('error', function(err, req, res){
        logger.error({
            label: loggerLabel,
            message: err
        });
    })
    logger.info({
        label: loggerLabel,
        message: `Service proxy launched at ${proxyUrl} .`
    });
}

function launchToolServer() {
    const app = express();
    const port = 19002;
    const url = `exp://${getIpAddress()}:${barcodePort}/`;
    app.use(express.static(__dirname + '/../tools-site'));
    app.get("/", (req, res) => {
        const template = fs.readFileSync(__dirname+ '/../tools-site/index.html.template', {
            encoding: "utf-8"
        });
        res.send(template.replace(/\{\{url\}\}/g, url));
    });
    app.listen(port);
    logger.info({
        label: loggerLabel,
        message: `open http://localhost:${port}/ in browser.`
    });
    open(`http://localhost:${port}/`);
}

function getIpAddress() {
    var interfaces = os.networkInterfaces();
    for(var key in interfaces) {
        var addresses = interfaces[key];
        for(var i = 0; i < addresses.length; i++) {
            var address = addresses[i];
            if(!address.internal && address.family === 'IPv4') {
                return address.address;
            };
        };
    };
    return 'localhost';
}

async function updatePackageJsonFile(path) {
    let data = fs.readFileSync(path, 'utf-8');
    const jsonData = JSON.parse(data);
    if (jsonData['dependencies']['expo-file-system'] === '^15.1.1') {
        jsonData['dependencies']['expo-file-system'] = '15.2.2'
    }
    if(isWebPreview){
        jsonData['dependencies']['react-native-svg'] = '13.4.0';
    }
    fs.writeFileSync(path, JSON.stringify(jsonData), 'utf-8');
    logger.info({
        'label': loggerLabel,
        'message': 'updated package.json file'
    });
}

async function transpile(projectDir, previewUrl, incremental) {
    let codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (codegen) {
        codegen = `${codegen}/wavemaker-rn-codegen/build/index.js`;
    } else {
        const wmProjectDir = getWmProjectDir(projectDir);
        codegen = `${projectDir}/target/codegen/node_modules/@wavemaker/rn-codegen`;
        if (!fs.existsSync(`${codegen}/index.js`)) {
            const temp = projectDir + '/target/codegen';
            fs.mkdirSync(temp, {recursive: true});
            await exec('npm', ['init', '-y'], {
                cwd: temp
            });
            var pom = fs.readFileSync(`${projectDir}/pom.xml`, { encoding: 'utf-8'});
            var uiVersion = ((pom 
                && pom.match(/wavemaker.app.runtime.ui.version>(.*)<\/wavemaker.app.runtime.ui.version>/))
                || [])[1];
            await exec('npm', ['install', '--save-dev', `@wavemaker/rn-codegen@${uiVersion}`], {
                cwd: temp
            });
        }     
        await readAndReplaceFileContent(`${codegen}/src/profiles/expo-preview.profile.js`, (content) => {
            return content.replace('copyResources: false', 'copyResources: true');
        });
    }
    const profile = isWebPreview ? 'web-preview' : 'expo-preview';
    await exec('node',
        [codegen, 'transpile', '--profile="' + profile + '"', '--autoClean=false',
            `--incrementalBuild=${!!incremental}`,
            getWmProjectDir(projectDir), getExpoProjectDir(projectDir)]);
    const expoProjectDir = getExpoProjectDir(projectDir);
    const configJSONFile = `${expoProjectDir}/wm_rn_config.json`;
    const config = fs.readJSONSync(configJSONFile);
    if (isWebPreview) {
        config.serverPath = `${proxyUrl}/_`;
    } else if (useProxy) {
        config.serverPath = `http://${getIpAddress()}:${proxyPort}/`;
    } else {
        config.serverPath = previewUrl;
    }
    fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    // TODO: iOS app showing blank screen
    if (!(config.sslPinning && config.sslPinning.enabled)) {
        await readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/App.js`, content => {
            return content.replace('if (isSslPinningAvailable()) {', 
                'if (false && isSslPinningAvailable()) {');
        });
    }
    logger.info({
        label: loggerLabel,
        message: `generated expo project at ${getExpoProjectDir(projectDir)}`
    });
}

async function installDependencies(projectDir) {
    await updatePackageJsonFile(getExpoProjectDir(projectDir)+ '/package.json');
    await exec('npm', ['install'], {
        cwd: getExpoProjectDir(projectDir)
    });
}

async function launchExpo(projectDir, web) {
    //openTerminal(`cd ${getExpoProjectDir(projectDir)}; expo start --web`);
    const args = ['expo', 'start', ];
    if (web) {
        args.push('--web');
    } else {
        launchToolServer();
    }
    await exec('npx', args, {
        cwd: getExpoProjectDir(projectDir)
    });
}

function clean(path) {
    if (fs.existsSync(path)) {
        rimraf.sync(path, {recursive: true});
    }
    fs.mkdirSync(path, {recursive: true});
}

async function getProjectName(previewUrl) {
    return JSON.parse(
        (await axios.get(`${previewUrl}/services/application/wmProperties.js`))
            .data.split('=')[1].replace(';', '')).displayName;
}

function getWmProjectDir(projectDir) {
    return `${projectDir}/src/main/webapp`;
}

function getExpoProjectDir(projectDir) {
    if (isWebPreview) {
        return `${projectDir}/target/generated-rn-web-app`;
    }
    return `${projectDir}/target/generated-expo-app`;
}

async function setup(previewUrl, _clean, authToken) {
    const projectName = await getProjectName(previewUrl);
    const projectDir = `${global.rootDir}/wm-projects/${projectName.replace(/\s+/g, '_').replace(/\(/g, '_').replace(/\)/g, '_')}`;
    if (_clean) {
        clean(projectDir);
    } else {
        fs.mkdirpSync(getWmProjectDir(projectDir));
    }
    const syncProject = await setupProject(previewUrl, projectName, projectDir, authToken);
    await transpile(projectDir, previewUrl, false);
    return {projectDir, syncProject};
}

async function watchProjectChanges(previewUrl, onChange, lastModifiedOn) {
    try {
        const response = await axios.get(`${previewUrl}/rn-bundle/index.html`, {
            headers: {
                'if-modified-since' : lastModifiedOn || new Date().toString()
            }
        }).catch((e) => e.response);
        if (response.status === 200 && response.data.indexOf('<title>WaveMaker Preview</title>') > 0) {
            lastModifiedOn = response.headers['last-modified'];
            onChange();
        }
    } catch(e) {
        logger.debug({
            label: loggerLabel,
            message: e
        });
    }
    setTimeout(() => watchProjectChanges(previewUrl, onChange, lastModifiedOn), 5000);
}
// expo android, ios are throwing errors with reanimated plugin
// hence modifying the 2.8.0version and just adding chrome debugging fix to this.
function updateReanimatedPlugin(projectDir) {
    let path = getExpoProjectDir(projectDir);
    path = path + '/node_modules/react-native-reanimated/src/reanimated2/NativeReanimated/NativeReanimated.ts';
    let content = fs.readFileSync(path, 'utf-8');
    content = content.replace(/global.__reanimatedModuleProxy === undefined/gm, `global.__reanimatedModuleProxy === undefined && native`);
    fs.writeFileSync(path, content);
}

function watchForPlatformChanges(callBack) {
    let codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (!codegen) {
        return;
    }
    setTimeout(() => {
        let doBuild = false;
        if (fs.existsSync(`${codegen}/wavemaker-rn-runtime/dist/new-build`)) {
            fs.unlinkSync(`${codegen}/wavemaker-rn-runtime/dist/new-build`);
            doBuild = true;
        }
        if (fs.existsSync(`${codegen}/wavemaker-rn-codegen/dist/new-build`)) {
            fs.unlinkSync(`${codegen}/wavemaker-rn-codegen/dist/new-build`);
            doBuild = true;
        }
        if (fs.existsSync(`${codegen}/wavemaker-ui-variables/dist/new-build`)) {
            fs.unlinkSync(`${codegen}/wavemaker-ui-variables/dist/new-build`);
            doBuild = true;
        }
        if (doBuild && callBack) {
            console.log('\n\n\n')
            logger.info({
                label: loggerLabel,
                message: 'Platform Changed. Building again.'
            });
            callBack().then(() => {
                watchForPlatformChanges(callBack);
            });
        } else {
            watchForPlatformChanges(callBack);
        }
    }, 5000);
}

async function runExpo(previewUrl, clean, authToken) {
    try {
        const {projectDir, syncProject} = await setup(previewUrl, clean, authToken);

        await installDependencies(projectDir);
        if (!isWebPreview) {
            updateReanimatedPlugin(projectDir);
        }
        const packageFile = `${getExpoProjectDir(projectDir)}/package.json`;
        const package = JSON.parse(fs.readFileSync(packageFile, {
            encoding: 'utf-8'
        }));
        barcodePort = package['dependencies']['expo'] === '48.0.18' ? 19000:8081;
        if (useProxy || isWebPreview) {
            launchServiceProxy(projectDir, previewUrl);
        }
        if (!isWebPreview) {
            launchExpo(projectDir);
        }
        watchProjectChanges(previewUrl, () => {
            const startTime = Date.now();
            syncProject()
            .then(() => {
                logger.info({
                    label: loggerLabel,
                    message: `Sync Time: ${(Date.now() - startTime)/ 1000}s.`
                });
            })
            .then(() => transpile(projectDir, previewUrl, true))
            .then(() => {
                logger.info({
                    label: loggerLabel,
                    message: `Total Time: ${(Date.now() - startTime)/ 1000}s.`
                });
            });
        });
        watchForPlatformChanges(() => transpile(projectDir, previewUrl, false));
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
    }
}

async function sync(previewUrl, clean) {
    const {projectDir, syncProject} = await setup(previewUrl, clean);
    proxyPort = 19007;
    proxyUrl = `http://${getIpAddress()}:${proxyPort}`;
    await installDependencies(projectDir);
    if (useProxy) {
        launchServiceProxy(projectDir, previewUrl);
    }
    watchProjectChanges(previewUrl, () => {
        const startTime = Date.now();
        syncProject()
        .then(() => {
            logger.info({
                label: loggerLabel,
                message: `Sync Time: ${(Date.now() - startTime)/ 1000}s.`
            });
        }).then(() => transpile(projectDir, previewUrl, true))
        .then(() => {
            logger.info({
                label: loggerLabel,
                message: `Total Time: ${(Date.now() - startTime)/ 1000}s.`
            });
        });
    });
    watchForPlatformChanges(() => transpile(projectDir, previewUrl, false));
}

async function runNative(previewUrl, platform, clean) {
    try {
        const {projectDir, syncProject} = await setup(previewUrl, clean);

        await installDependencies(projectDir);
        updateReanimatedPlugin(projectDir);
        if (useProxy) {
            launchServiceProxy(projectDir, previewUrl);
        }
        await exec('npx', ['expo','prebuild'], {
            cwd: getExpoProjectDir(projectDir)
        });
        await transpile(projectDir, previewUrl, false);
        await installDependencies(projectDir);
        if (platform === 'ios') {
            await exec('pod', ['install'], {
                cwd: getExpoProjectDir(projectDir) + '/ios'
            });
        }
        await exec('npx', [
            'react-native',
            platform === 'android' ? 'run-android' : 'run-ios'
        ], {
            cwd: getExpoProjectDir(projectDir)
        });
        watchProjectChanges(previewUrl, () => {
            const startTime = Date.now();
            syncProject()
                .then(() => {
                    logger.info({
                        label: loggerLabel,
                        message: `Sync Time: ${(Date.now() - startTime)/ 1000}s.`
                    });
                })
                .then(() => transpile(projectDir, previewUrl, true))
                .then(() => {
                    logger.info({
                        label: loggerLabel,
                        message: `Total Time: ${(Date.now() - startTime)/ 1000}s.`
                    });
                });
        });
        watchForPlatformChanges(() => transpile(projectDir, previewUrl, false));
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
    }
}

module.exports = {
    runESBuildWebPreview: (previewUrl, clean, authToken) => {
        isWebPreview = true;
        runExpo(previewUrl, clean, authToken);
    },
    runExpo: runExpo,
    runAndroid: (previewUrl, clean) => runNative(previewUrl, 'android', clean),
    runIos: (previewUrl, clean) => runNative(previewUrl, 'ios', clean),
    sync: (previewUrl, clean, _useProxy) => {
        useProxy = _useProxy;
        return sync(previewUrl, clean)
    }
};
