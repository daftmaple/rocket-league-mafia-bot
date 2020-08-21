# Rocket League Mafia Bot

A crappy bot that handles only one match at a time and not persistent

Things to upgrade:

- ~~There can be only one match per bot (will be refactored to one match per channel, or even per host)~~ Now supports one party per channel
- Handles only 6 players in a match
- Doesn't store points when bot is restarted

## To start the bot in pm2 instance

Since npm package number can only be parsed when running npm script, use this command:

```sh
pm2 start npm --name "mafiabot" -- start
```

## How it works

A game can be created from a party that consists of 6 players. Once a game starts, these players will be split into two teams, and only 1 player will be assigned the mafia role.

Scenarios:

- If you are a mafia and your team loses, you will gain 3 points.
- If you are a non-mafia, you will gain 1 point if you win.
- If you vote a mafia (as a non-mafia), you will gain 1 point. Mafia will lose 1 point for each vote.
- You can't vote for yourself.
