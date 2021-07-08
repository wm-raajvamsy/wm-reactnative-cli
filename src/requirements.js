const fs = require('fs');
const os = require('os');
const semver = require('semver');

const logger = require('./logger');
const {
    exec
} = require('./exec');
const loggerLabel = 'cordova-cli-requirements';
const VERSIONS = {
    'NODE': '12.0.0'
}
let projectSrc;

// check if expo cli is installed globally or not
// gradle check
async function checkAvailability(cmd, transformFn) {
    try {
        let options = {};
        if (projectSrc) {
            options = {
                cwd: projectSrc
            }
        }
        let output = (await exec(cmd, ['--version'])).join('');
        
        if (transformFn) {
            output = transformFn(output);	
        }	
        // to just return version in x.x.x format
        let version = output.match(/[0-9]+\.[0-9\.]+/)[0];

        logger.info({
            'label': loggerLabel,
            'message': cmd + ' version available is ' + version
        })
        const requiredVersion = VERSIONS[cmd.toUpperCase()];
        version = semver.coerce(version).version;
        if (requiredVersion && semver.lt(version, requiredVersion)) {
            logger.error('Minimum ' + cmd + ' version required is ' + requiredVersion + '. Please update the version.');
            return false;
        }
        return version;
    } catch(e) {
        console.error(e);
        logger.error('Observing error while checking ' + cmd.toUpperCase() + ' availability');
        return false;
    }
}

async function isGitInstalled() {
    return await checkAvailability('git');
}

async function isCocoaPodsIstalled() {
    return await checkAvailability('pod');
}

async function hasValidNodeVersion() {
    return await checkAvailability('node');
}

function validateForIos(certificate, password, provisionalFilePath, packageType) {
    let errors = [];
    if (!(certificate && fs.existsSync(certificate))) {
        errors.push(`p12 certificate does not exists : ${certificate}`);
    }
    if (!password) {
        errors.push('password to unlock certificate is required.');
    }
    if (!(provisionalFilePath && fs.existsSync(provisionalFilePath))) {
        errors.push(`Provisional file does not exists : ${provisionalFilePath}`);
    }
    if (!packageType) {
        errors.push('Package type is required.');
    }
    return errors;
}

module.exports = {
    validateForIos: validateForIos,
    isCocoaPodsIstalled: isCocoaPodsIstalled,
    isGitInstalled: isGitInstalled,
    hasValidNodeVersion: hasValidNodeVersion
}
// TODO check for yarn
