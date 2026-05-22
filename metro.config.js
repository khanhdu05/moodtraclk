const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /dist-test[/\\].*/,
  /web-server\.(err\.)?log$/,
  /expo-(web|mobile)\.(err\.)?log$/
];

module.exports = config;
