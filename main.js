'use strict';


var fetch = require('fetch');
var sequence = require('when/sequence');

var config = require('./config');
var lib = require('./lib');

exports.name = 'i18n';
exports.desc = 'multilingual support';


/**
 * 注册命令
 *
 * @param  {Commander} commander 命令类
 */
exports.register = function (commander) {

    commander
        .option('-p, --project <project>', '设置工程名称', String)
        .option('-u, --update <keyname>', 'update lang.json', String)
        .option('-f, --force', 'update lang.json', Boolean, false)
        .option('-c, --check', 'update lang.json', Boolean, false)
        .action(function (command) {

            var root = fis.util.realpath(process.cwd());;

            if (!command.project) {
                fis.log.error('请输入当前工程名称');
                return;
            }

            lib
                .getFilesAndKeys(command.project, root, command.update || 'all')
                .then(function (res) {
                    var files = res.files;
                    var keys = res.keys;

                    // 验证
                    if (command.check) {
                        lib.checki18n(files);
                    }

                    // 更新
                    if (command.update) {

                        fetch.fetchUrl(
                            config.protocol + '//' + config.host
                            + (config.port ? (':' + config.port) : '')
                            + config.path + '?files=' + keys.join(','),
                            function (err, meta, body) {

                                if (err) {
                                    fis.log.error('拉取数据失败');
                                    return;
                                }

                                var data = body.toString();

                                try {
                                    data = JSON.parse(data);
                                }
                                catch (e) {
                                    fis.log.error('数据解析失败');
                                    return;
                                }

                                if (data.errno != 0) {
                                    fis.log.error('数据解析失败');
                                    return;
                                }

                                var result = data.info.data;
                                var tasks = [];

                                for (var key in result) {
                                    var lang = lib.convert(result[key]);
                                    var diffResult = lib.handleLang(root, key, lang);

                                    if (diffResult.diff.length) {
                                        tasks.push(lib.commandLine(diffResult, command.force));
                                    }
                                }

                                sequence(tasks);
                            }
                        );
                    }
                });
        });
};
