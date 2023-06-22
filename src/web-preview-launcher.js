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
const axios = require('axios');
const { setupProject } = require('./project-sync.service');
const webPreviewPort = 19006;
const proxyPort = 19009;
const proxyUrl = `http://localhost:${proxyPort}`;
const loggerLabel = 'expo-launcher';
let codegen = '';

function launchServiceProxy(projectDir, previewUrl) {
    const proxy =  httpProxy.createProxyServer({});
    const wmProjectDir = getWmProjectDir(projectDir);
    http.createServer(function (req, res) {
        try {
            let tUrl = req.url;
            if (req.url === '/' || (!req.url.startsWith('/_/'))) {
                tUrl = `http://localhost:${webPreviewPort}${req.url}`;
                req.pipe(request(tUrl)).pipe(res);
            } else {
                req.url = req.url.substring(2);
                proxy.web(req, res, {
                    target: previewUrl,
                    xfwd: false,
                    changeOrigin: true,
                    cookiePathRewrite: {
                        "*": ""
                    }
                });
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

async function transpile(projectDir, previewUrl) {
    codegen || await getCodeGenPath(projectDir);
    const wmProjectDir = getWmProjectDir(projectDir);
    const configJSONFile = `${wmProjectDir}/wm_rn_config.json`;
    const config = require(configJSONFile);
    config.serverPath = `${proxyUrl}/_`;
    fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    await exec('node',
        [codegen + '/index.js', 'transpile', '--profile="expo-preview"', '--autoClean=false',
            getWmProjectDir(projectDir), getExpoProjectDir(projectDir)]);
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
    await updateForWebPreview(projectDir);
    await installDependencies(projectDir);
}

async function updateForWebPreview(projectDir) {
    const packageFile = `${getExpoProjectDir(projectDir)}/package.json`;
    const package = JSON.parse(fs.readFileSync(packageFile, {
        encoding: 'utf-8'
    }));
    package.dependencies['react-native-reanimated'] = '^1.13.2';
    package.dependencies['victory'] = '^36.5.3';
    package.devDependencies['esbuild'] = '^0.15.15';
    package.devDependencies['fs-extra'] = '^10.0.0';
    fs.writeFileSync(packageFile, JSON.stringify(package, null, 4));
    fs.copySync(`${codegen}/src/templates/project/esbuild`, `${getExpoProjectDir(projectDir)}/esbuild`);
    readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/babel.config.js`, content => 
        content.replace(`'react-native-reanimated/plugin',`, '')
        .replace(`'transform-remove-console'`, ''))
}

async function getCodeGenPath(projectDir) {
    codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (codegen) {
        codegen = `${codegen}/wavemaker-rn-codegen/build`;
    } else {
        codegen = `${projectDir}/target/node_modules/@wavemaker/rn-codegen`;
        if (!fs.existsSync(`${codegen}/index.js`)) {
            const temp = projectDir + '/target';
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
    }
}

async function installDependencies(projectDir) {
    const expoDir = getExpoProjectDir(projectDir);
    if (fs.existsSync(`${expoDir}/node_modules`)) {
        return;
    }
    await exec('npm', ['install'], {
        cwd: expoDir
    });
    await exec('npm', ['install', '@expo/webpack-config@^0.17.2'], {
        cwd: expoDir
    });
    await exec('node', ['./esbuild/esbuild.script.js', '--prepare-lib'], {
        cwd: expoDir
    });
    fs.copySync(
        `${expoDir}/esbuild/node_modules`, 
        `${expoDir}/node_modules`,
        {
        overwrite: true
        });
    const nodeModulesDir = `${expoDir}/node_modules/@wavemaker/app-rn-runtime`;
    readAndReplaceFileContent(`${nodeModulesDir}/core/base.component.js`, (c) => c.replace(/\?\?/g, '||'));
    readAndReplaceFileContent(`${nodeModulesDir}/components/advanced/carousel/carousel.component.js`, (c) => c.replace(/\?\?/g, '||'));
    readAndReplaceFileContent(`${nodeModulesDir}/components/input/rating/rating.component.js`, (c) => c.replace(/\?\?/g, '||'));
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
    return `${projectDir}/generated-rn-app`;
}

async function setup(previewUrl, _clean) {
    const projectName = await getProjectName(previewUrl);
    const projectDir = `${global.rootDir}/wm-projects/${projectName.replace(/\s+/g, '_').replace(/\(/g, '_').replace(/\)/g, '_')}`;
    if (_clean) {
        clean(projectDir);
    } else {
        fs.mkdirpSync(getWmProjectDir(projectDir));
    }
    const syncProject = await setupProject(previewUrl, projectName, projectDir);
    await transpile(projectDir, previewUrl);
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

async function runWeb(previewUrl, clean) {
    try {
        const {projectDir, syncProject} = await setup(previewUrl, clean);
        launchServiceProxy(projectDir, previewUrl);
        let isExpoStarted = false;
        watchProjectChanges(previewUrl, () => {
            syncProject().then(() => {
                return transpile(projectDir, previewUrl).then(() => {
                    if (!isExpoStarted) {
                        return exec('npx', ['expo', 'start', '--web'], {
                            cwd: getExpoProjectDir(projectDir)
                        });
                    }
                }).then(() => {
                    isExpoStarted = true;
                });
            });
        });
        watchForPlatformChanges(() => transpile(projectDir, previewUrl));
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
    }
}

module.exports = {
    runWeb: runWeb
};
