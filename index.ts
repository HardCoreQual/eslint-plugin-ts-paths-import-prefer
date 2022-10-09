import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { Rule } from "eslint";

function has(map: Record<string, any>, path: string) {
  let inner = map;
  for (let step of path.split(".")) {
    inner = inner[step];
    if (inner === undefined) {
      return false;
    }
  }
  return true;
}

function findDirWithFile(filename: string) {
  let dir = path.resolve(filename);

  do {
    dir = path.dirname(dir);
  } while (!fs.existsSync(path.join(dir, filename)) && dir !== "/");

  if (!fs.existsSync(path.join(dir, filename))) {
    throw new Error(`Could not find ${filename} in any parent directory`);
  }

  return dir;
}

function getBaseUrl(baseDir: string) {
  let url = "";

  if (fs.existsSync(path.join(baseDir, "tsconfig.json"))) {
    const tsconfig = JSON5.parse(
      fs.readFileSync(path.join(baseDir, "tsconfig.json"), 'utf8')
    );
    if (has(tsconfig, "compilerOptions.baseUrl")) {
      url = tsconfig.compilerOptions.baseUrl;
    }
  } else if (fs.existsSync(path.join(baseDir, "jsconfig.json"))) {
    const jsconfig = JSON5.parse(
      fs.readFileSync(path.join(baseDir, "jsconfig.json"), 'utf8')
    );
    if (has(jsconfig, "compilerOptions.baseUrl")) {
      url = jsconfig.compilerOptions.baseUrl;
    }
  }

  return path.join(baseDir, url);
}

function normalizeFilename(filename: string) {
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

const preferTsPaths: Rule.RuleModule = {
  meta: {
    fixable: "code",
  },
  create: function (context) {
    const baseDir = findDirWithFile("tsconfig.json");
    const paths = JSON5.parse(fs.readFileSync(path.join(baseDir, 'tsconfig.json'), 'utf-8'))?.compilerOptions.paths ?? {};
    const baseUrl = getBaseUrl(baseDir);

    const reversePaths = Object.entries(paths as Record<string, string[]>).reduce((acc, [key, value]) => {
      value?.forEach((v) => {
        acc[normalizeFilename(v)] = key;
      });
      return acc;
    } , {} as Record<string, string>);

    return {
      ImportDeclaration(node) {
        const source = node.source.value as string;

        if (source?.startsWith(".")) {
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
      },
    }
  }
}
module.exports.rules = {
  "prefer-ts-paths": preferTsPaths,
};
