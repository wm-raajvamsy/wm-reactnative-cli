const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

const loggerLabel = 'wm-scope';

const SCOPES = Object.freeze({
    CLASSIC: '@wavemaker',
    AI: '@wavemaker-ai'
});

const DEFAULT_SCOPE = SCOPES.CLASSIC;
const SCOPED_PACKAGES = ['app-rn-runtime', 'rn-codegen', 'rn-app'];
const UI_BUILD_FILE = 'ui-build.js';
const UI_BUILD_SCOPE_PATTERN = /NPM_PACKAGE_SCOPE\s*=\s*['"](@[a-z0-9][a-z0-9._~-]*)['"]/;

function onlyOne(scopes) {
    const found = [...new Set(scopes.filter(Boolean))];
    return found.length === 1 ? found[0] : null;
}

function readScopeFromPackageJson(dir) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) {
        return null;
    }
    let pkg;
    try {
        pkg = fs.readJSONSync(file);
    } catch (e) {
        return null;
    }
    const deps = Object.keys({...pkg.dependencies, ...pkg.devDependencies});
    return onlyOne(Object.values(SCOPES).map(scope =>
        SCOPED_PACKAGES.some(p => deps.includes(`${scope}/${p}`)) && scope));
}

function readScopeFromNodeModules(dir) {
    return onlyOne(Object.values(SCOPES).map(scope =>
        fs.existsSync(path.join(dir, 'node_modules', scope, 'app-rn-runtime')) && scope));
}

function getProjectScope(projectDir) {
    const file = path.join(projectDir, UI_BUILD_FILE);
    const match = fs.existsSync(file)
        && fs.readFileSync(file, { encoding: 'utf-8' }).match(UI_BUILD_SCOPE_PATTERN);
    if (match) {
        logger.info({ label: loggerLabel, message: `using ${match[1]} packages, as declared in ${file}.` });
        return match[1];
    }
    logger.warn({ label: loggerLabel, message: `no NPM_PACKAGE_SCOPE found in ${file}, using ${DEFAULT_SCOPE}.` });
    return DEFAULT_SCOPE;
}

function getAppScope(appDir) {
    return readScopeFromPackageJson(appDir) || readScopeFromNodeModules(appDir);
}

module.exports = {
    SCOPES,
    DEFAULT_SCOPE,
    getProjectScope,
    getAppScope
};
