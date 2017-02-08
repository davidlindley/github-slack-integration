let CONFIG = require("./config");
let Slack = require('slack-node');
let GitHubApi = require("github");
let slack = new Slack();
let github = new GitHubApi({
  protocol: "https",
  host: "api.github.com",
  pathPrefix: "",
  headers: {"user-agent": CONFIG.COMPANY},
  followRedirects: false,
  timeout: 5000
});

/**
 * @name initAPILinks
 * @desc Initialises the Slack and GitHub APIs
 */
var initAPILinks = () => {
  slack.setWebhook(CONFIG.SLACK_URI);
  github.authenticate({
      type: "oauth",
      token: CONFIG.GITHUB_KEY
  });
};

/**
 * @name slackNotifier
 * @desc Sends a message to a dedicated slack channel
 * @param {string} message - The message to send
 * @returns {string} channel - The channel to send to. Can be users by using the @<USERNAME>
 */
var slackNotifier = (message, channel) => {
  slack.webhook({
    channel: channel,
    username: CONFIG.SLACK_NAME,
    icon_emoji: CONFIG.SLACK_ICON,
    text: message
  }, function(err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log('message sent!');
    }
  });
};

/**
 * @name getPullRequests
 * @desc Gets current pull requests
 * @returns {Promise} - A promise which when resolved will return the pull requests
 */
var getPullRequests = () => {
  return new Promise((resolve, reject) => {
    github.pullRequests.getAll({
      owner: CONFIG.COMPANY,
      repo: CONFIG.REPO
    }).then((pullRequests) => {
      resolve(pullRequests);
    }, (error) => {
      reject(error);
    })
  });
};

/**
 * @name addIssueLabels
 * @param {Array} pullRequests - The phoneplan ID
 * @desc Adds issue labels to the passed in pull requests
 * @returns {Promise} - A promise which when resolved will return pull requests
 * with the lables attached
 */
var addIssueLabels = (pr) => {
  return new Promise((resolve, reject) => {
      github.issues.getIssueLabels({
      owner: CONFIG.COMPANY,
      repo: CONFIG.REPO,
      number: pr.number
    }).then((prLabels) => {
      // Clean up the response by removing meta data
      if (prLabels.hasOwnProperty('meta')) {
        delete prLabels.meta;
      }
      // Add labels to the original Pull Request
      pr['labels'] = prLabels;

      resolve(pr);
    }, (error) => {
      reject(error);
    });
  });
};

/**
 * @name processPullRequests
 * @desc Splits the pull requests into need merge and not need merge based on labels
 * @param {Array} pullRequests - Current pull requests
 * @returns {Promise} - Promise when resolved returns object
 * { mergeNeeded: [], noMergeNeeded: [] }
 */
var processPullRequests = (pullRequests) => {
  return new Promise((resolve, reject) => {
    var labelPromises = [];

    // Loop through each PR to get its labels
    pullRequests.forEach((pr) => {
      labelPromises.push(addIssueLabels(pr));
    });

    Promise.all(labelPromises).then((pullRequests) => {
      var filteredPullRequests = {
        mergeNeeded : [],
        noMergeNeeded: []
      };

      pullRequests.forEach((pr) => {
        var noMerge = false;
        pr.labels.forEach((label) => {
          if (CONFIG.IGNORE_LABLES.indexOf(label.name) > -1) {
            noMerge = true;
            return;
          }
        });
        if (noMerge) {
          filteredPullRequests.noMergeNeeded.push(pr);
        } else {
          filteredPullRequests.mergeNeeded.push(pr);
        }
      });
      resolve(filteredPullRequests);
    });
  });
};

/**
 * @name getReminderMessage
 * @desc Formats a reminder message
 * @param {number} - hours the PR is old
 * @returns {string} - Reminder message
 */
var getReminderMessage = (hoursOld) => {
  var reminderMessage = `${hoursOld} hours ago`;
  if (hoursOld >= 12) {
    return `${reminderMessage} :bangbang::exclamation::angry:`;
  }
  if (hoursOld >= 6) {
    return `${reminderMessage} :bangbang:`;
  }
  if (hoursOld >= 3) {
    return `${reminderMessage} :exclamation:`;
  }
  if (hoursOld < 3) {
    return `${reminderMessage}`;
  }
}

/**
 * @name getNextYorkLabDeployment
 * @desc Works out how long until the next YL deploy
 * @param {number} - minutues until next YL deploy
 */
var howLongUntilYLDeploy = () => {
  // Assumes once per hour
  var now = new Date();
  var mins = now.getMinutes();
  return 60 - mins;
};

var hoursOld = (date) => {
  var now = new Date();
  return hours = Math.round((now - date) / 36e5);
}

/**
 * @name createSlackMessage
 * @desc Uses the pullrequests to create a custom slack message
 * @param {Array} pullRequests - Current pull requests
 */
var createSlackMessage = (pullRequests) => {
  if (!pullRequests) {
    pullRequests = {
      mergeNeeded : [],
      noMergeNeeded: []
    };
  }
  var message = `*The current status of github ${CONFIG.COMPANY}-${CONFIG.REPO} is:*\n`;
  message += `>Outstanding pull requests: ${pullRequests.mergeNeeded.length + pullRequests.noMergeNeeded.length}\n`;
  message += `>Don\'t merge now: ${pullRequests.noMergeNeeded.length}\n`;
  message += `>Review Needed: ${pullRequests.mergeNeeded.length}\n\n`;

  if (pullRequests.mergeNeeded.length > 0) {
    message += `*Review Needed:*\n`;

    for (var i = 0; i < pullRequests.mergeNeeded.length; i++) {
      var pr = pullRequests.mergeNeeded[i];
      var createdDate = new Date(pr.created_at);
      var prAgeHours = hoursOld(createdDate);

      message += `>* (${i + 1}) ${pr.title}*`
      message += pr.body ? ` - ${pr.body}\n` : `\n`;
      message += `>_Rasied by ${pr.user.login} ${getReminderMessage(prAgeHours)}_\n`;
      message +=  `>${pr.html_url}\n\n`;
    }
  }
  message += CONFIG.AUTO_DEPLOYMENT_MESSAGE
        ? `*:stopwatch: Next Automatic YorkLab Deployment for ${CONFIG.COMPANY}-${CONFIG.REPO} in ${howLongUntilYLDeploy()} minutes:stopwatch:*`;
        : '';

  slackNotifier(message, CONFIG.SLACK_CHANNEL);
}

/****************/
/* Runs the app */
/****************/
initAPILinks();
getPullRequests()
.then((pullRequests) => {
  if (pullRequests.length === 0) {
    createSlackMessage();
  }
  processPullRequests(pullRequests)
  .then((processedPullRequests) => {
    createSlackMessage(processedPullRequests);
  });
});
