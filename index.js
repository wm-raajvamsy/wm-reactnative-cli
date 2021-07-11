#!/usr/bin/env node

const {
    ejectProject, build
} = require('./src/command');

// src is the web react native project zip
const args = require('yargs')
    .command('build', 'build the project to generate android and ios folders', yargs => {
            yargs.command('android [src] [options]', 'build for android', yargs => {
                yargs.option('appId', {
                    alias: 'appId',
                    describe: 'unique application identifier',
                    type: 'string'
                })
                .option('aks', {
                    alias: 'aKeyStore',
                    describe: '(Android) path to keystore',
                    type: 'string'
                })
                .option('asp', {
                    alias: 'aStorePassword',
                    describe: '(Android) password to keystore',
                    type: 'string'
                })
                .option('aka', {
                    alias: 'aKeyAlias',
                    describe: '(Android) Alias name',
                    type: 'string'
                })
                .option('akp', {
                    alias: 'aKeyPassword',
                    describe: '(Android) password for key.',
                    type: 'string'
                })
            }, args => {
                args.platform = 'android';
                build(args)
            })
            .command('ios [src] [options]', 'build for iOS', yargs => {
                yargs.option('ic', {
                    alias: 'iCertificate',
                    describe: '(iOS) path of p12 certificate to use',
                    type: 'string'
                })
                .option('icp', {
                    alias: 'iCertificatePassword',
                    describe: '(iOS) password to unlock certificate',
                    type: 'string'
                })
                .option('ipf', {
                    alias: 'iProvisioningFile',
                    describe: '(iOS) path of the provisional profile to use',
                    type: 'string'
                })
                .option('icsi', {
                    alias: 'iCodeSigningIdentity',
                    describe: 'Common Name of the Developer iOS certificate stored in the Keychain Access application',
                    type: 'string'
                });
            }, args => {
                args.platform = 'ios';
                build(args)
            })
            yargs.positional('src', {
                describe: 'path of rn project',
                default: './',
                type: 'string',
                normalize: true
            })
            .option('dest', {
                alias: 'dest',
                describe: 'dest folder where the react native project will be extracted to',
                type: 'string'
            })
            .option('p', {
                alias: 'packageType',
                describe: 'development (or) release',
                default: 'development',
                choices: ['development', 'production']
            })
            .option('localrnruntimepath', {
                alias: 'localrnruntimepath',
                describe: 'local path pointing to the app-rn-runtime folder',
                type: 'string'
            })
            .option('auto-eject', {
                alias: 'autoEject',
                describe: 'If set to true then project will be eject automatically without prompting any confirmations',
                default: false,
                type: 'boolean'
            })
    })
    .help('h')
    .alias('h', 'help').argv;
