const logger = require('./logger');
const fs = require('fs-extra');
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
const proxyPort = 19009;
const proxyUrl = `http://${getIpAddress()}:${proxyPort}`;
const loggerLabel = 'expo-launcher';
function installGlobalNpmPackage(package) {
    return exec('npm', ['install', '-g', package]);
}

function launchServiceProxy(previewUrl) {
    const proxy =  httpProxy.createProxyServer({});
    http.createServer(function (req, res) {
        let tUrl = req.url;
        if (req.url.startsWith('/_/')) {
            req.url = req.url.substring(3);
            proxy.web(req, res, {
                target: previewUrl,
                xfwd: false,
                changeOrigin: true,
                cookiePathRewrite: {
                    "*": ""
                }
            });
            tUrl = `${previewUrl}/${req.url.substring(3)}`;
        } else {
            tUrl = `http://localhost:19006${req.url}`;
            req.pipe(request(tUrl)).pipe(res);
        }
    }).listen(proxyPort);
    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        proxyReq.setHeader('sec-fetch-mode', 'no-cors');
        proxyReq.setHeader('origin', previewUrl);
        proxyReq.setHeader('referer', previewUrl);
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

async function transpile(projectDir, previewUrl, useServiceProxy) {
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
    if (useServiceProxy) {
        config.serverPath = `${proxyUrl}/_`;
    } else if (config.serverPath === '{{DEVELOPMENT_URL}}') {
        config.serverPath = previewUrl;
    }
    fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    await exec('node',
        [codegen, 'transpile', '--profile="expo-preview"',
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

async function setup(previewUrl, useServiceProxy, _clean) {
    const projectName = await getProjectName(previewUrl);
    const projectDir = `${global.rootDir}/wm-projects/${projectName}`;
    if (_clean) {
        clean(projectDir);
    } else {
        fs.mkdirpSync(getWmProjectDir(previewUrl));
    }
    const syncProject = await setupProject(previewUrl, projectName, projectDir);
    await transpile(projectDir, previewUrl, useServiceProxy);
    return {projectDir, syncProject};
}

async function watchProjectChanges(previewUrl, useServiceProxy, onChange, lastModifiedOn) {
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
    setTimeout(() => watchProjectChanges(previewUrl, useServiceProxy, onChange, lastModifiedOn), 5000);
}

async function runExpo(previewUrl, web, clean) {
    const useServiceProxy = !!web;
    try {
        const hasExpo = await hasValidExpoVersion();
        if (!hasExpo) {
            logger.debug({
                label: loggerLabel,
                message: 'Installing expo-cli@'  + VERSIONS.EXPO
            });
            await installGlobalNpmPackage('expo-cli@' + VERSIONS.EXPO);
        }
        const {projectDir, syncProject} = await setup(previewUrl, useServiceProxy, clean);
        await installDependencies(projectDir);
        if (useServiceProxy) {
            launchServiceProxy(previewUrl);
        }
        launchExpo(projectDir, web);
        watchProjectChanges(previewUrl, useServiceProxy, () => {
            syncProject().then(() => transpile(projectDir, previewUrl, useServiceProxy));
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