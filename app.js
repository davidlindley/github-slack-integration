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
var slackNotifier = (message, channel, name, icon) => {
  return new Promise((resolve, reject) => {
    slack.webhook({
      channel: channel,
      username: name,
      icon_emoji: icon,
      text: message
    }, function(err, response) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * @name getPullRequests
 * @desc Gets current pull requests
 * @returns {Promise} - A promise which when resolved will return the pull requests
 */
var getPullRequests = (repoName) => {
  return new Promise((resolve, reject) => {
    github.pullRequests.getAll({
      owner: CONFIG.COMPANY,
      repo: repoName
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
var addIssueLabels = (pr, repoName) => {
  return new Promise((resolve, reject) => {
      github.issues.getIssueLabels({
      owner: CONFIG.COMPANY,
      repo: repoName,
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
var processPullRequests = (pullRequests, repoDetails) => {
  return new Promise((resolve, reject) => {
    var labelPromises = [];

    // Loop through each PR to get its labels
    pullRequests.forEach((pr) => {
      labelPromises.push(addIssueLabels(pr, repoDetails.REPO_NAME));
    });

    Promise.all(labelPromises).then((pullRequests) => {
      var filteredPullRequests = {
        mergeNeeded : [],
        noMergeNeeded: []
      };

      pullRequests.forEach((pr) => {
        var noMerge = false;
        pr.labels.forEach((label) => {
          if (repoDetails.IGNORE_LABLES.indexOf(label.name) > -1) {
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
var createSlackMessage = (pullRequests, repo) => {
  if (!pullRequests) {
    pullRequests = {
      mergeNeeded : [],
      noMergeNeeded: []
    };
  }
  var message = `:vertical_traffic_light: *The current status of github ${CONFIG.COMPANY}-${repo.REPO_NAME} is:*\n`;

  if (pullRequests.mergeNeeded.length === 0 && pullRequests.noMergeNeeded.length === 0) {
    message += `>No active pull requests :smile:\n`;
  } else {
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
  }
  message += repo.AUTO_DEPLOYMENT_MESSAGE
        ? `*:stopwatch: Next Automatic YorkLab Deployment for ${CONFIG.COMPANY}-${repo.REPO_NAME} in ${howLongUntilYLDeploy()} minutes:stopwatch:*`
        : '';

  return message;
}

/****************/
/* Runs the app */
/****************/
initAPILinks();
var allRepoMessages = [];
CONFIG.REPOS.forEach((repo) => {
  allRepoMessages.push(new Promise((resolve, reject) => {
    getPullRequests(repo.REPO_NAME)
    .then((pullRequests) => {
      processPullRequests(pullRequests, repo)
      .then((processedPullRequests) => {
        var message = createSlackMessage(processedPullRequests, repo);
        slackNotifier(message, repo.SLACK_CHANNEL, repo.SLACK_NAME, repo.SLACK_ICON).then(() => {
          resolve();
        });
      });
    });

  }));
});

Promise.all(allRepoMessages).then(() => {
  console.log('all messages sent');
});
