#!/usr/bin/env node

const {
    ejectProject, build
} = require('./src/command');

// src is the web react native project zip
const args = require('yargs')
    .command('eject [src] [packagename] [localrnruntimepath]', 'generates react-native project from the expo project', yargs => {
        yargs.positional('src', {
            describe: 'path of expo project',
            default: './',
            type: 'string',
            normalize: true
        });
        yargs.positional('packagename', {
            describe: 'package name of react native project',
            default: '',
            type: 'string',
            normalize: true
        });
        yargs.positional('localrnruntimepath', {
            describe: 'local path pointng to the app-rn-runtime folder',
            default: '',
            type: 'string',
            normalize: true
        });
    }, args => ejectProject(args))
    .command('build', 'build the project to generate android and ios folders', yargs => {
            yargs.command('android [src] [options]', 'build for android', yargs => {
                yargs.positional('src', {
                    describe: 'path of rn project',
                    default: './',
                    type: 'string',
                    normalize: true
                });
                yargs.option('aks', {
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
                yargs.positional('src', {
                    describe: 'path of rn project',
                    default: './',
                    type: 'string',
                    normalize: true
                });
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
            .option('p', {
                alias: 'packageType',
                describe: 'development (or) release',
                default: 'development',
                choices: ['development', 'production']
            })
    })
    .help('h')
    .alias('h', 'help').argv;