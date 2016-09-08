"use strict";

const fs = require('fs'),
    tmp = require('tmp'),
    {join} = require('path'),
    {spawn, spawnSync} = require('child_process'),
    VERSION_RE = /Aseprite ([\w.-]+)/;

tmp.setGracefulCleanup();

class AsepritePlugin {
    constructor(config) {
        this.config = config && config.plugins && config.plugins.aseprite || {};
        this.bin = this.config.bin || 'aseprite';
        this.staticTargetExtension = 'png';
        this.extension = 'ase';

        // Get our aseprite version
        let asepriteProc = spawnSync(this.bin, ['--version'], {
            timeout: 10000,
            encoding: 'utf8'
        });

        if(asepriteProc.error) throw asepriteProc.error;

        let versionMatch = VERSION_RE.exec(asepriteProc.stdout);
        if(versionMatch) {
            this.asepriteVersion = versionMatch[1].split('.');
        } else {
            throw Error(`could not get aseprite version running [${asepriteProc.args}]`);
        }

        this.dataPathTransformer = function(path) {
            const assetsRe = config.conventions.assets,
                outputDir = config.paths.public;
            let match = path.match(assetsRe);
            if(match)
                return join(outputDir, path.substring(match.index + match[0].length));
            return join(outputDir, path);
        }
    }

    compileStatic(file) {
        return new Promise((resolve, reject) => {
            tmp.file({
                postfix: `.${this.staticTargetExtension}`
            }, (err, sheetPath, _, cleanupCallback) => {
                if(err) {
                    cleanupCallback();
                    return reject(err);
                }

                let asepriteProc = spawn(this.bin, [
                    '--batch',
                    file.path,
                    '--trim',
                    '--ignore-empty',
                    '--list-layers',
                    '--list-tags',
                    '--sheet',
                    sheetPath,
                    '--data',
                    this.dataPathTransformer(file.path.replace(/\.ase/, '.json'))
                ]);

                asepriteProc.on('close', (code) => {
                    if(code === 0) {
                        // Aseprite says everything is ok
                        fs.readFile(sheetPath, (err, data) => {
                            if(err) {
                                cleanupCallback();
                                return reject(err);
                            }
                            file.data = data;
                            cleanupCallback();
                            return resolve(file);
                        });
                    } else {
                        cleanupCallback();
                        return reject(Error(`[${asepriteProc.spawnargs}] exited with error code ${code}`));
                    }
                });
            });
        });
    }
};

AsepritePlugin.prototype.brunchPlugin = true;
module.exports = AsepritePlugin;
