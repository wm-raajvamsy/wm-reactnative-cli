const logger = require('./logger');
const fs = require('fs-extra');
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
const loggerLabel = 'expo-launcher';
function installGlobalNpmPackage(package) {
    return exec('npm', ['install', '-g', package]);
}

function launchServiceProxy(previewUrl) {
    const ip = getIpAddress();
    httpProxy.createProxyServer({
        target: previewUrl,
        changeOrigin: true
    }).on('proxyRes', function (proxyRes, req, res) {
        const cookies = proxyRes.headers['set-cookie'];
        if (cookies) {
            proxyRes.headers['set-cookie'] = cookies.map(c => {
                return c.split(';').map(s => s.trim()).filter(cs => {
                    return !(cs.startsWith('Path') || cs.startsWith('Secure') || cs.startsWith('HttpOnly'));
                }).join('; ');
            });;
        }
        if (req.method === 'OPTIONS') {
            proxyRes.headers['access-control-allow-origin'] = `http://${ip}:19006`;
            proxyRes.headers['access-control-allow-methods'] = proxyRes.headers['access-control-allow-methods'] || 'GET, PUT, POST, DELETE, OPTIONS';
            proxyRes.headers['access-control-allow-headers'] = proxyRes.headers['access-control-allow-headers'] || 'x-wm-xsrf-token';
            proxyRes.headers['access-control-allow-credentials'] = true;
            proxyRes.headers['access-control-max-age'] = 1600;
        }
    }).listen(proxyPort);
    logger.info({
        label: loggerLabel,
        message: `Service proxy launched on ${proxyPort} .`
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
        config.serverPath = `http://${getIpAddress()}:${proxyPort}`;
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