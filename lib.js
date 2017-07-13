var fs = require('fs');

var when = require('when');
var minimatch = require("minimatch");
var recursive = require("recursive-readdir");
var _ = require('lodash');
var hash = require('object-hash');
var prompt = require('prompt');

var regexp = /\/(component_modules|component|template|page)\/([^\/]+?)\//g;

/**
 * 文件分类
 *
 * @param  {string} lang 语言包文件
 * @return {Object}      类型数据
 */
var classify = function (lang) {

    if (new RegExp(regexp).test(lang)) {
        return {
            type: RegExp.$1,
            name: (RegExp.$2 || '').replace(/didi-component-/g, '')
        };
    }
};

/**
 * 获取当前文件依赖的lang.json路径
 *
 * @param  {string} file 文件路径
 * @return {string}
 */
var getLangJsonPath = function (file) {

    if (new RegExp(regexp).test(file)) {
        return file.replace(new RegExp(regexp), function (match, type, name) {
            return '/' + type + '/' + name + '/lang.json';
        });
    }
};

/**
 * diff 语言包
 *
 * @param  {Array} necessary 需要的语言包数据
 * @param  {Array} current   当前的语言包数据
 * @return {Array}           缺少的语言包数据
 */
var diffLang = function (necessary, current) {
    return necessary.filter(function (a) {
        var flag = true;

        current.forEach(function (b) {
            if (typeof a == 'string') {
                if (a == b.zh_cn) {
                    flag = false;
                }
            }
            else {
                if (hash(a) == hash(b)) {
                    flag = false;
                }
            }
        });
        return flag;
    });
};


/**
 * 校验语言字段
 *
 * @param  {Array} files 文件列表
 * @return {Array}
 */
var checki18n = function (files) {
    var cache = {}

    files = files.filter(function (file) {
        if (/(.*)(template|page|component_modules|components)(\/[^/]*\/)(.*)/g.test(file)) {
            return true;
        }
    });

    files.forEach(function (file) {
        var langNeed = [];
        var content = fs.readFileSync(file, 'utf-8');
        var langPkg = file.replace(
            /(.*)(template|page|component_modules|components)(\/[^/]*\/)(.*)/g,
            function (match, project, dir, feature) {
                return project + dir + feature;
            }
        ) + 'lang.json';

        var segs = content.split(/__i18n/g);
        segs.shift();
        segs.forEach(function (seg) {
            var flag = true;
            var stack = [];
            seg.split('').forEach(function (char, index) {
                if (flag == true) {
                    if (char == '(') {
                        stack.push(char);
                    }
                    else if (char == ')') {
                        stack.push(char);
                        if (stack.length % 2 == 0) {
                            flag = false;
                            langNeed.push(seg.substring(1, index));
                        }
                    }
                }
            });
        });


        cache[langPkg] = cache[langPkg] || {};
        cache[langPkg].need = cache[langPkg].need || [];
        cache[langPkg].need = cache[langPkg].need.concat(langNeed);
    });

    files
        .filter(minimatch.filter('lang.json', {matchBase: true}))
        .forEach(function (file) {
            cache[file] = cache[file] || {};

            var content = fs.readFileSync(file, 'utf-8');

            try {
                content = JSON.parse(content);
            }
            catch (e) {
                fis.log.error('解析语言包\"' + file + '\"失败，请检查!');
                return;
            }

            cache[file].current = content;
        });

    var errors = [];

    for (var langPkg in cache) {
        if (cache[langPkg].need.length) {
            cache[langPkg].diff = diffLang(cache[langPkg].need, cache[langPkg].current);

            if (cache[langPkg].diff.length) {
                errors.push('\nfile: ' + langPkg + ' needs the following fields: \n' + cache[langPkg].diff.join(' | '))
            }
        }
    }
    // 有错误需要输出提示
    if (errors.length) {
        fis.log.notice(errors.join(''));
    }
};

/**
 * 获取文件列表及keys
 *
 * @param  {string} project 工程名称
 * @param  {string} root    根目录
 * @param  {string} key     key值
 * @return {Promise}        promise
 */
var getFilesAndKeys = function (project, root, key) {
    var defer = when.defer();
    var keys = [];

    recursive(root, function (err, files) {

        files = files.filter(function (file) {

            if (key != 'all') {
                var filenames = key.split(',');
                var filterFiles = filenames.filter(function (filename) {
                    if (file.indexOf(filename) > -1) {
                        return true;
                    }
                });

                if (filterFiles.length == 0) {
                    return false;
                }
            }

            var result = classify(file);
            if (result) {
                if (result.type == 'component_modules') {
                    keys.push('component|' + result.name);
                }
                else {
                    keys.push(project + '|' + result.type + '|' + result.name);
                }
            }

            return true;
        });

        defer.resolve({
            files: _.uniq(files),
            keys: _.uniq(keys)
        });

    });

    return defer.promise;
};

/**
 * 转换远程语言包格式
 *
 * @param  {Array} lang 语言包数据
 * @return {Array}      语言包数据
 */
var convert = function (lang) {
    return lang.map(function (item) {
        var obj = {};

        for (var key in item) {
            obj[key.replace(/-/g, '_').toLowerCase()] = item[key];
        }

        return obj;
    });
};

/**
 * 处理语言包
 *
 * @param  {string} root  root
 * @param  {string} key   key
 * @param  {Array}  lang  语言数据
 */
var handleLang = function (root, key, lang, force) {
    var comps = key.split('|');
    comps.shift();

    var filePath = root + '/' + comps.join('/') + '/lang.json';

    var current = fs.readFileSync(filePath);

    try {
        current = JSON.parse(current);
    }
    catch (e) {
        fis.log.error('Parse Error:' + filePath);
    }

    if (force) {
        fs.writeFileSync(filePath, JSON.stringify(lang, null, 4));
    }
    else {
        var diff = diffLang(current, lang);
        return {
            diff: diff,
            filePath: filePath,
            lang: lang
        };
    }

};


var commandLine = function (diffResult, force) {

    return function () {

        var filePath = diffResult.filePath;
        var lang = diffResult.lang;
        var defer = when.defer();
        if (diffResult.diff.length) {

            console.log('Find different fields:', diffResult.diff.map(function (item) {return item['zh_cn'];}));

            if (force) {
                fs.writeFileSync(filePath, JSON.stringify(lang, null, 4));
                return;
            }

            prompt.get(
                {
                    name: 'force',
                    description: 'Whether to use remote language packs? yes/no',
                    type: 'string',
                    hidden: false,
                    default: 'yes'
                },
                function (err, result) {

                    if (err) {
                        fis.log.error(err);
                        return;
                    }

                    if (result.force == 'yes') {
                        fis.log.notice('use remote');
                        fs.writeFileSync(filePath, JSON.stringify(lang, null, 4));
                        filePath
                    }
                    else if (result.force == 'no') {
                        fis.log.notice('user cancel');
                    }
                    else {
                        fis.log.notice('Can not recognize the instruction');
                    }

                    defer.resolve();
                }
            );
        }
        return defer.promise;
    };
};

module.exports = {
    classify: classify,
    diffLang: diffLang,
    checki18n: checki18n,
    getFilesAndKeys: getFilesAndKeys,
    convert: convert,
    handleLang: handleLang,
    commandLine: commandLine
};
