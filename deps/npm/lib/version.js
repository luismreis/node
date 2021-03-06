// npm version <newver>

module.exports = version

var exec = require("child_process").execFile
  , semver = require("semver")
  , path = require("path")
  , fs = require("graceful-fs")
  , chain = require("slide").chain
  , log = require("npmlog")
  , which = require("which")
  , npm = require("./npm.js")
  , git = require("./utils/git.js")

version.usage = "npm version [<newversion> | major | minor | patch | prerelease | preminor | premajor ]\n"
              + "\n(run in package dir)\n"
              + "'npm -v' or 'npm --version' to print npm version "
              + "("+npm.version+")\n"
              + "'npm view <pkg> version' to view a package's "
              + "published version\n"
              + "'npm ls' to inspect current package/dependency versions"

function version (args, silent, cb_) {
  if (typeof cb_ !== "function") cb_ = silent, silent = false
  if (args.length > 1) return cb_(version.usage)
  fs.readFile(path.join(process.cwd(), "package.json"), function (er, data) {
    if (!args.length) {
      var v = {}
      Object.keys(process.versions).forEach(function (k) {
        v[k] = process.versions[k]
      })
      v.npm = npm.version
      try {
        data = JSON.parse(data.toString())
      } catch (er) {
        data = null
      }
      if (data && data.name && data.version) {
        v[data.name] = data.version
      }
      if (npm.config.get("json")) {
        v = JSON.stringify(v, null, 2)
      }
      console.log(v)
      return cb_()
    }

    if (er) {
      log.error("version", "No package.json found")
      return cb_(er)
    }

    try {
      data = JSON.parse(data)
    } catch (er) {
      log.error("version", "Bad package.json data")
      return cb_(er)
    }

    var newVer = semver.valid(args[0])
    if (!newVer) newVer = semver.inc(data.version, args[0])
    if (!newVer) return cb_(version.usage)
    if (data.version === newVer) return cb_(new Error("Version not changed"))
    data.version = newVer

    fs.stat(path.join(process.cwd(), ".git"), function (er, s) {
      function cb (er) {
        if (!er && !silent) console.log("v" + newVer)
        cb_(er)
      }

      var tags = npm.config.get('git-tag-version')
      var doGit = !er && s.isDirectory() && tags
      if (!doGit) return write(data, cb)
      else checkGit(data, cb)
    })
  })
}

function checkGit (data, cb) {
  var args = [ "status", "--porcelain" ]
  var options = {env: process.env}

  // check for git
  git.whichAndExec(args, options, function (er, stdout) {
    var lines = stdout.trim().split("\n").filter(function (line) {
      return line.trim() && !line.match(/^\?\? /)
    }).map(function (line) {
      return line.trim()
    })
    if (lines.length) return cb(new Error(
      "Git working directory not clean.\n"+lines.join("\n")))
    write(data, function (er) {
      if (er) return cb(er)
      var message = npm.config.get("message").replace(/%s/g, data.version)
        , sign = npm.config.get("sign-git-tag")
        , flag = sign ? "-sm" : "-am"
      chain
        ( [ git.chainableExec([ "add", "package.json" ], {env: process.env})
          , git.chainableExec([ "commit", "-m", message ], {env: process.env})
          , sign && function (cb) {
              npm.spinner.stop()
              cb()
            }

          , git.chainableExec([ "tag", "v" + data.version, flag, message ]
            , {env: process.env}) ]
        , cb )
    })
  })
}

function write (data, cb) {
  fs.writeFile( path.join(process.cwd(), "package.json")
              , new Buffer(JSON.stringify(data, null, 2) + "\n")
              , cb )
}
