const JobBoard = artifacts.require("JobBoard");

module.exports = function (deployer) {
  deployer.deploy(JobBoard);
};