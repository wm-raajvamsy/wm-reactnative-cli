const { URL } = require('url');
const fs = require('fs-extra');
const logger = require('./logger');
const prompt = require('prompt');
const axios = require('axios');
const os = require('os');
const qs = require('qs');
const { exec } = require('./exec');

//const PULL_URL = '/studio/services/projects/${projectId}/vcs/remoteChanges';
const STORE_KEY = 'user.auth.token';
const MAX_REQUEST_ALLOWED_TIME = 5 * 60 * 1000;
const loggerLabel = 'project-sync-service';


async function pullChanges(projectDir) {
    await exec('mvn', ['wavemaker-workspace:pull'], {
        cwd: projectDir
    });
}

async function findProjectId(config) {
    const projectList = (await axios.get(`${config.baseUrl}/edn-services/rest/users/projects/list`,
        {headers: {
            cookie: config.authCookie
        }})).data;
    const project = projectList.filter(p => p.displayName === config.projectName);
    return project && project.length && project[0].studioProjectId;
}

async function downloadProject(config, projectDir) {
    const start = Date.now();
    logger.info({
        label: loggerLabel,
        message: 'downloading the project.'
    });
    const projectId = await findProjectId(config);
    const fileId = (await axios.post(`${config.baseUrl}/studio/services/projects/${projectId}/export`, 
    JSON.stringify({exportType: "ZIP", targetName: "BugZ"}),
    {
        headers: {
            cookie: config.authCookie,
            'content-type': 'application/json;charset=UTF-8'
        }
    })).data.result;
    const tempFile = `${os.tmpdir()}/changes_${Date.now()}.zip`;
    const res = await axios.get(`${config.baseUrl}/file-service/${fileId}`, {
        responseType: 'stream'
    });
    if (res.status !== 200) {
        throw new Error('failed to download the project');
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
    fs.mkdirpSync(projectDir);
    await exec('unzip', ['-o', tempFile, '-d', projectDir], {
        log: false
    });
    logger.info({
        label: loggerLabel,
        message: `downloaded the project in (${Date.now() - start} ms).`
    });
    return tempFile;
}

function initWorkspace() {

}

function pullChanges() {

}

function extractAuthCookie(res) {
    const headers = res && res.response && res.response.headers;
    if (!headers) {
        return;
    }
    const result = headers['set-cookie'].filter(s => s.indexOf('auth_cookie') >= 0);
    if (result.length) {
        return result[0].split(';')[0];
    }
}

async function authenticate(config) {
    const credentials = await getUserCredentials();
    //const credentials = {username: 'srinivasa.boyina@wavemaker.com', password: 'Pramati@123'};
    return axios.post(`${config.baseUrl}/login/authenticate`, 
        qs.stringify({
            j_username: credentials.username,
            j_password: credentials.password
        }), {
            maxRedirects: 0
    }).catch((res) => {
        const cookie = extractAuthCookie(res);
        if (!cookie) {
            console.log('Not able to login. Try again.');
            return authenticate(config);
        }
        return cookie;
    });
}

function getUserCredentials() {
    var schema = {
        properties: {
            username: {
                required: true
            },
            password: {
                required: true,
                hidden: true
            }
        }
      };
    prompt.start();
    return new Promise((resolve, reject) => {
        prompt.get(schema, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

async function checkAuthCookie(config) {
    try {
        await axios.get(`${config.baseUrl}/studio/services/auth/token`, {
            headers: {
                cookie: config.authCookie
            },
            maxRedirects: 0
        });
        logger.info({
            label: loggerLabel,
            message: `user authenticated.`
        });
    } catch(e) {
        return false;
    }
    return true;
}

async function setup(previewUrl, projectName) {
    const config = {
        authCookie : global.localStorage.getItem(STORE_KEY) || '',
        baseUrl: new URL(previewUrl).origin,
        appPreviewUrl: previewUrl,
        projectName: projectName
    };
    const isAuthenticated = await checkAuthCookie(config);
    if (!isAuthenticated) {
        console.log(`Need to login to Studio (${config.baseUrl}). \n Please enter your Studio credentails.`);
        config.authCookie = await authenticate(config);
        global.localStorage.setItem(STORE_KEY, config.authCookie)
    }
    return config;
}

async function setupProject(previewUrl, projectName, toDir) {
    const config = await setup(previewUrl, projectName);
    await downloadProject(config, toDir);
    return () => downloadProject(config, toDir);
};

module.exports = {
    setupProject : setupProject
};