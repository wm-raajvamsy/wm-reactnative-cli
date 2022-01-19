const logger = require('./logger');
const fs = require('fs-extra');
const rimraf = require("rimraf");
const {
    exec
} = require('./exec');
const rootDir = `${require('os').homedir()}/.wm-reactnative-cli`;
const {VERSIONS, hasValidExpoVersion} = require('./requirements');
const tempDir = rootDir + '/temp';
const axios = require('axios');
//const openTerminal =  require('open-terminal').default;
const MAX_REQUEST_ALLOWED_TIME = 5 * 60 * 1000;
fs.mkdirSync(tempDir, {recursive: true});
const loggerLabel = 'expo-launcher';
function installGlobalNpmPackage(package) {
    return exec('npm', ['install', '-g', package]);
}
let lastSyncTime = 0;
async function transpile(projectDir) {
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

async function launchExpo(projectDir) {
    //openTerminal(`cd ${getExpoProjectDir(projectDir)}; expo start --web`);
    await exec('expo', ['start'], {
        cwd: getExpoProjectDir(projectDir)
    });
}

async function downloadProject(previewUrl) {
    const tempFile = `${tempDir}/changes_${Date.now()}.zip`;
    const res = await axios.get(`${previewUrl}/services/project/exportChanges?after=${lastSyncTime}`, {
        timeout: MAX_REQUEST_ALLOWED_TIME,
        responseType: 'stream'
    }).catch(error => error.response);
    lastSyncTime = (res.headers && res.headers['x-wm-exported-at']) || lastSyncTime;
    if (res.status === 304) {
        return '';
    }
    if (res.status !== 200) {
        throw new Error('failed to download the zip');
    }
    await new Promise((resolve, reject) => {
        const fw = fs.createWriteStream(tempFile);
        res.data.pipe(fw);
        fw.on('error', err => {
            reject(err);
            fw.close();
        });
        fw.on('close', resolve);
    });
    logger.info({
        label: loggerLabel,
        message: 'downloaded the base zip.'
    });
    return tempFile;
}

function clean(path) {
    if (fs.existsSync(path)) {
        rimraf.sync(path);
    }
    fs.mkdirSync(path, {recursive: true});
}

function getWmProjectDir(projectDir) {
    return `${projectDir}/wm-project`;
}

function getExpoProjectDir(projectDir) {
    return `${projectDir}/expo-project`;
}

async function setup(zipFile, previewUrl, _clean) {
    const tempProjectDir = `${tempDir}/${Date.now()}`;
    await exec('unzip', ['-o', zipFile, '-d', tempProjectDir], {
        log: false
    });
    const configJSONFile = `${tempProjectDir}/wm_rn_config.json`;
    const config = require(configJSONFile);
    if (config.serverPath === '{{DEVELOPMENT_URL}}') {
        config.serverPath = previewUrl;
        fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    }
    const projectDir = `${rootDir}/build/${config.id}`;
    const wmProjectDir = getWmProjectDir(projectDir);
    const expoProjectDir = getExpoProjectDir(projectDir);
    if (_clean) {
        clean(wmProjectDir);
        clean(expoProjectDir);
    }
    fs.copySync(tempProjectDir, wmProjectDir);
    rimraf.sync(tempProjectDir);
    rimraf.sync(zipFile);
    return projectDir;
}

async function syncLocalWMProject(previewUrl, clean) {
    const zipFile = await downloadProject(previewUrl);
    if (zipFile) {
        const projectDir = await setup(zipFile, previewUrl, clean);
        await transpile(projectDir);
        return projectDir;
    }
}

async function checkForChanges(previewUrl) {
    try {
        await syncLocalWMProject(previewUrl);
    } catch(e) {
        logger.debug({
            label: loggerLabel,
            message: e
        });
    }
    const current = Date.now();
    setTimeout(() => checkForChanges(previewUrl, current), 5000);
}

async function runExpo(previewUrl) {
    try {
        const hasExpo = await hasValidExpoVersion();
        if (!hasExpo) {
            logger.debug({
                label: loggerLabel,
                message: 'Installing expo-cli@'  + VERSIONS.EXPO
            });
            await installGlobalNpmPackage('expo-cli@' + VERSIONS.EXPO);
        }
        const projectDir = await syncLocalWMProject(previewUrl, true);
        await installDependencies(projectDir);
        launchExpo(projectDir);
        checkForChanges(previewUrl);
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