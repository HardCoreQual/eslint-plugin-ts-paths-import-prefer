"use strict";

const fs = require("fs");
const path = require("path");
const JSON5 = require("json5");

function has(map, path) {
  let inner = map;
  for (let step of path.split(".")) {
    inner = inner[step];
    if (inner === undefined) {
      return false;
    }
  }
  return true;
}

function findDirWithFile(filename) {
  let dir = path.resolve(filename);

  do {
    dir = path.dirname(dir);
  } while (!fs.existsSync(path.join(dir, filename)) && dir !== "/");

  if (!fs.existsSync(path.join(dir, filename))) {
    return;
  }

  return dir;
}

function getBaseUrl(baseDir) {
  let url = "";

  if (fs.existsSync(path.join(baseDir, "tsconfig.json"))) {
    const tsconfig = JSON5.parse(
      fs.readFileSync(path.join(baseDir, "tsconfig.json"))
    );
    if (has(tsconfig, "compilerOptions.baseUrl")) {
      url = tsconfig.compilerOptions.baseUrl;
    }
  } else if (fs.existsSync(path.join(baseDir, "jsconfig.json"))) {
    const jsconfig = JSON5.parse(
      fs.readFileSync(path.join(baseDir, "jsconfig.json"))
    );
    if (has(jsconfig, "compilerOptions.baseUrl")) {
      url = jsconfig.compilerOptions.baseUrl;
    }
  }

  return path.join(baseDir, url);
}

function normalizeFilename(filename) {
  if (filename.endsWith('.js') || filename.endsWith('.ts')) {
    filename = filename.slice(0, -3);
  }
  if (filename.endsWith('.tsx') || filename.endsWith('.jsx')) {
    filename = filename.slice(0, -4);
  }
  if (filename.endsWith('/index')) {
    filename = filename.slice(0, -6);
  }
  return filename;
}

module.exports.rules = {
  "only-absolute-imports": {
    meta: {
      fixable: true,
    },
    create: function (context) {
      const baseDir = findDirWithFile("tsconfig.json");
      const paths = JSON5.parse(fs.readFileSync(path.join(baseDir, 'tsconfig.json')))?.compilerOptions.paths;
      const baseUrl = getBaseUrl(baseDir);

      const reversePaths = Object.entries(paths ?? {}).reduce((acc, [key, value]) => {
        value.forEach((v) => {
          acc[normalizeFilename(v)] = key;
        });
        return acc;
      } , {});

      return {
        ImportDeclaration(node) {
          const source = node.source.value;
          if (source.startsWith(".")) {
            const filename = context.getFilename();

            const absolutePath = path.normalize(
              path.join(path.dirname(filename), source)
            );
            const expectedPath = path.relative(baseUrl, absolutePath);

            if (reversePaths[normalizeFilename(expectedPath)]) {
              context.report({
                node,
                message: `Import should be absolute`,
                fix(fixer) {
                  return fixer.replaceText(node.source, `'${reversePaths[normalizeFilename(expectedPath)]}'`);
                },
              });
            }
          }
        }
      }
    }
  },
};
