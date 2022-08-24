const logger = require('./logger');
const fs = require('fs-extra');
const express = require('express');
const http = require('http');
const request = require('request');
const os = require('os');
const rimraf = require("rimraf");
const httpProxy = require('http-proxy');
const {
    exec
} = require('./exec');
const {VERSIONS, hasValidExpoVersion} = require('./requirements');
const axios = require('axios');
const { setupProject } = require('./project-sync.service');
//const openTerminal =  require('open-terminal').default;
const webPreviewPort = 19005;
const proxyPort = 19009;
const proxyUrl = `http://${getIpAddress()}:${proxyPort}`;
const loggerLabel = 'expo-launcher';
function installGlobalNpmPackage(package) {
    return exec('npm', ['install', '-g', package]);
}

function launchServiceProxy(projectDir, previewUrl) {
    const proxy =  httpProxy.createProxyServer({});
    const wmProjectDir = getWmProjectDir(projectDir);
    const app = express();
    app.use('/rn-bundle', express.static(wmProjectDir + '/rn-bundle'));
    app.get("/*", (req, res) => {
        res.status(301).redirect("/rn-bundle/index.html");
    });
    app.listen(webPreviewPort);
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
    logger.info({
        label: loggerLabel,
        message: `Service proxy launched at ${proxyUrl} .`
    });
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

async function transpile(projectDir, previewUrl, isWebPreview) {
    let codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (codegen) {
        codegen = `${codegen}/wavemaker-rn-codegen/build/index.js`;
    } else {
        const wmProjectDir = getWmProjectDir(projectDir);
        const temp = wmProjectDir + '/temp';
        fs.mkdirSync(temp, {recursive: true});
        await exec('npm', ['init', '-y'], {
            cwd: wmProjectDir + '/temp'
        });
        await exec('npm', ['install', '--save-dev', '@wavemaker/rn-codegen'], {
            cwd: wmProjectDir + '/temp'
        });
        codegen = `${wmProjectDir}/temp/node_modules/@wavemaker/rn-codegen/index.js`;
    }
    const wmProjectDir = getWmProjectDir(projectDir);
    const configJSONFile = `${wmProjectDir}/wm_rn_config.json`;
    const config = require(configJSONFile);
    if (isWebPreview) {
        config.serverPath = `${proxyUrl}/_`;
    } else if (config.serverPath === '{{DEVELOPMENT_URL}}') {
        config.serverPath = previewUrl;
    }
    fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    const profile = isWebPreview ? 'web-preview' : 'expo-preview';
    await exec('node',
        [codegen, 'transpile', '--profile="' + profile + '"',
            getWmProjectDir(projectDir), getExpoProjectDir(projectDir)]);
    logger.info({
        label: loggerLabel,
        message: `generated expo project at ${getExpoProjectDir(projectDir)}`
    });
}

async function installDependencies(projectDir) {
    await exec('npm', ['install'], {
        cwd: getExpoProjectDir(projectDir)
    });
}

async function launchExpo(projectDir, web) {
    //openTerminal(`cd ${getExpoProjectDir(projectDir)}; expo start --web`);
    const args = ['start'];
    if (web) {
        args.push('--web');
    }
    await exec('expo', args, {
        cwd: getExpoProjectDir(projectDir)
    });
}

function clean(path) {
    if (fs.existsSync(path)) {
        rimraf.sync(path);
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
    return `${projectDir}/generated-rn-app`;
}

async function setup(previewUrl, isWebPreview, _clean) {
    const projectName = await getProjectName(previewUrl);
    const projectDir = `${global.rootDir}/wm-projects/${projectName}`;
    if (_clean) {
        clean(projectDir);
    } else {
        fs.mkdirpSync(getWmProjectDir(previewUrl));
    }
    const syncProject = await setupProject(previewUrl, projectName, projectDir);
    await transpile(projectDir, previewUrl, isWebPreview);
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

async function runExpo(previewUrl, web, clean) {
    const isWebPreview = !!web;
    try {
        const hasExpo = await hasValidExpoVersion();
        if (!hasExpo) {
            logger.debug({
                label: loggerLabel,
                message: 'Installing expo-cli@'  + VERSIONS.EXPO
            });
            await installGlobalNpmPackage('expo-cli@' + VERSIONS.EXPO);
        }
        const {projectDir, syncProject} = await setup(previewUrl, isWebPreview, clean);

        await installDependencies(projectDir);
        if (!isWebPreview) {
            updateReanimatedPlugin(projectDir);
        }
        if (isWebPreview) {
            launchServiceProxy(projectDir, previewUrl);
        } else {
            launchExpo(projectDir, web);
        }
        watchProjectChanges(previewUrl, () => {
            syncProject().then(() => transpile(projectDir, previewUrl, isWebPreview));
        });
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
    }
}

module.exports = {
    runExpo: runExpo
};
