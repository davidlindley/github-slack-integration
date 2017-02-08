####Git Hub Slack Integration Tool
This is a tool used to notify a particular slack URL and channel with information relating to a particular github repo.
The application is meant to be run automatically using a cron job or similar. But it can also be ran manually.


###Installing and Running
Having cloned or checkout the repo run the following:
```
npm install
node app.js
```
This will run the app and notify the slack channel set up in the config.js file

###Configure
The app can be configured using the config.js file. The following configs can be set:

* GITHUB_KEY - An API key for your github repo
* SLACK_URI - The Slack URI for integrations
* SLACK_ICON - An Icon to show when notifying slack
* SLACK_NAME - The username to show when notifying slack
* SLACK_CHANNEL - The channel to notify, this has to start with # for channel or @ for user
* COMPANY - The Github account where the repo is location
* REPO - The repo to process
* IGNORE_LABLES - Array of github labels to ignore when processing
* AUTO_DEPLOYMENT_MESSAGE - boolean whether to show or hide the autodeployment message

###Integrating with slack
You will need to get a slack URL.
Follow the instructions here for your slack domain:
[Slack integration](https://btconsumeronline.slack.com/apps/new/A0F7XDUAZ-incoming-webhooks)

###Integrating with github
You will need to generate a github API key. This can be done following these instructions:
* Navigate to [github tokens](https://github.com/settings/tokens)
* Click Generate new token
* Ensure repo is selected
* Copy the resulting key into your config.js file
