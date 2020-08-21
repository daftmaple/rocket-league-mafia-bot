import dotenv from 'dotenv';

dotenv.config();

import Discord from 'discord.js';
import { Party, PlayerMap } from './types';

const prefix = process.env.BOT_PREFIX || 'm!';

const botAdmin = (process.env.BOT_ADMIN || '').split(',');

const idPlayerMapper = new PlayerMap();
let partyMap: Map<String, Party> = new Map();

const client: Discord.Client = new Discord.Client({
  retryLimit: 3,
});

client.on('message', async (message: Discord.Message) => {
  if (message.content.startsWith(prefix)) {
    // m!vote @
    const cmds: string[] = message.content
      .slice(prefix.length)
      .trim()
      .split(/\s+/);

    if (!(message.channel instanceof Discord.TextChannel)) return;

    const currentPlayer = idPlayerMapper.addOrFindPlayer(message.author);
    const channel = message.channel.id;

    const party = partyMap.get(channel);

    switch (cmds[0]) {
      case 'create':
        if (!!party) {
          message.channel.send('There is an ongoing party in this channel');
          return;
        }
        message.channel.send('Creating a party for this channel');
        partyMap.set(channel, new Party(message.channel.id, currentPlayer));
        break;
      case 'cancel':
        if (!party)
          message.channel.send('There is no ongoing party in this channel');
        else if (party.ongoingGame())
          message.channel.send('There is an ongoing game');
        else if (
          !party.isLeader(currentPlayer) &&
          message.member?.hasPermission('ADMINISTRATOR')
        ) {
          if (cmds[1] !== '-f') {
            message.channel.send(
              `<@${message.author.id}> To cancel currently running party as administrator, use \`${prefix}cancel -f\``
            );
          } else {
            partyMap.delete(channel);
            message.channel.send('Party has been disbanded forcefully');
          }
        } else if (!party.isLeader(currentPlayer) && !party.cancellable())
          message.channel.send(
            'User is not the party leader and last action (game/join/leave) was less than 10 minutes ago'
          );
        else {
          partyMap.delete(channel);
          message.channel.send('Party has been disbanded');
        }
        break;
      case 'status':
      case 'player':
      case 'players':
        if (!party)
          message.channel.send('There is no ongoing party in this channel');
        else {
          const embed = new Discord.MessageEmbed();
          embed.setTitle('Current party');
          embed.addFields([
            {
              name: 'Game status',
              value: party.ongoingGame() ? 'Running' : 'Not running',
            },
            {
              name: 'Current players:',
              value: party
                .getPlayers()
                .map((it) => it.discordUser().username)
                .join('\n'),
              inline: true,
            },
          ]);
          embed.setFooter(`Party last active: ${party.whenLastActive()}`);
          message.channel.send(embed);
        }
        break;
      case 'start':
      case 'remake':
        if (!party) {
          message.channel.send('There is no ongoing party in this channel');
          return;
        }
        try {
          const game = party.startGame();

          const m = game.getMafia();
          m.discordUser().send('You are the mafia');
          const ps = game.getOthers();
          ps.forEach((it) => {
            it.discordUser().send('You are not the mafia');
          });

          const teams = game.getUserNameList();

          const embed = new Discord.MessageEmbed();

          embed.setTitle('Game on!');
          embed.setDescription(
            'A game has been started. All players have received the DM!'
          );
          embed.addFields([
            { name: 'Team A', value: teams[0].join('\n'), inline: true },
            { name: 'Team B', value: teams[1].join('\n'), inline: true },
          ]);
          message.channel.send(embed);
        } catch (e) {
          if (e instanceof Error) message.channel.send(e.message);
        }
        break;
      case 'join':
        if (!party) {
          message.channel.send('There is no ongoing party in this channel');
          return;
        }
        try {
          party.addPlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${
              currentPlayer.discordUser().username
            } has joined the party`
          );
          embed.addField(
            'Current players:',
            party
              .getPlayers()
              .map((it) => it.discordUser().username)
              .join('\n')
          );
          message.channel.send(embed);
        } catch (e) {
          if (e instanceof Error) message.channel.send(e.message);
        }
        break;
      case 'leave':
        if (!party) {
          message.channel.send('There is no ongoing party in this channel');
          return;
        }
        try {
          party.removePlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${currentPlayer.discordUser().username} has left the party`
          );
          embed.addField(
            'Current players:',
            party
              .getPlayers()
              .map((it) => it.discordUser().username)
              .join('\n')
          );
          message.channel.send(embed);
        } catch (e) {
          if (e instanceof Error) message.channel.send(e.message);
        }
        break;
      case 'win':
        if (
          !cmds[1] ||
          !(cmds[1].toLowerCase() === 'a' || cmds[1].toLowerCase() === 'b')
        )
          message.channel.send(`Usage: \`${prefix}win <A / B>\``);
        else if (!party) {
          message.channel.send('There is no ongoing party in this channel');
        } else {
          const winnerIndex = cmds[1].toLowerCase() === 'a' ? 0 : 1;
          try {
            let allVoted = false;
            party.startVote(winnerIndex, (result) => {
              allVoted = true;

              const resultEmbed = new Discord.MessageEmbed();
              resultEmbed.setTitle('Game result');
              const resultArray: string[] = [];
              result.players.forEach((v, k) =>
                resultArray.push(`${k.discordUser().username}: ${v} points`)
              );
              resultEmbed.addFields(
                {
                  name: 'Mafia',
                  value: result.mafia.discordUser().username,
                },
                {
                  name: 'Results',
                  value: resultArray.join('\n'),
                }
              );

              message.channel.send(resultEmbed);
            });
            const players = party.getPlayers();
            const embed = new Discord.MessageEmbed();
            embed.setTitle('Vote for mafia');
            embed.setDescription(
              'Voting ends in 60 seconds or all players have voted'
            );
            embed.addField(
              'Players',
              players.map((it) => it.discordUser().username).join('\n')
            );
            await message.channel.send(embed);

            let counter = 0;
            const interval = setInterval(() => {
              counter++;
              if (counter === 3 || allVoted) clearInterval(interval);
              else
                message.channel.send(
                  `You have ${60 - counter * 15} seconds left`
                );
            }, 15 * 1000);

            setTimeout(() => {
              if (!allVoted) {
                message.channel.send('Voting is over');
                party.endGame();
              }
            }, 60 * 1000);
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
        break;
      case 'vote':
        if (!cmds[1]) {
          message.channel.send(`Usage: \`${prefix}vote <@player>\``);
        } else if (!party) {
          message.channel.send('There is no ongoing party');
        } else {
          try {
            let mention = cmds[1];
            if (mention.startsWith('<@') && mention.endsWith('>')) {
              mention = mention.slice(2, -1);

              if (mention.startsWith('!')) {
                mention = mention.slice(1);
              }
            }

            const votedUser = client.users.cache.get(mention);
            if (!votedUser)
              throw new Error('The mentioned user does not exist');

            const votedPlayer = idPlayerMapper.addOrFindPlayer(votedUser);
            party.playerVote(currentPlayer, votedPlayer);
            message.channel.send(
              `${currentPlayer.discordUser().username} voted for ${
                votedPlayer.discordUser().username
              }`
            );
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
        break;
      case 'kick':
        if (!cmds[1]) {
          message.channel.send(`Usage: \`${prefix}kick <@player>\``);
        } else if (!party) {
          message.channel.send('There is no ongoing party');
        } else {
          if (!party.isLeader(currentPlayer)) {
            message.channel.send('User is not party leader for this channel');
            return;
          }
          try {
            let mention = cmds[1];
            if (mention.startsWith('<@') && mention.endsWith('>')) {
              mention = mention.slice(2, -1);

              if (mention.startsWith('!')) {
                mention = mention.slice(1);
              }
            }

            const mentionedUser = client.users.cache.get(mention);
            if (!mentionedUser)
              throw new Error('The mentioned user does not exist');

            const mentionedPlayer = idPlayerMapper.addOrFindPlayer(
              mentionedUser
            );
            party.removePlayer(mentionedPlayer);
            message.channel.send(
              `User ${
                mentionedPlayer.discordUser().username
              } has been removed from current party`
            );
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
        break;
      case 'points':
        const resultEmbed = new Discord.MessageEmbed();
        resultEmbed.setTitle('Current standing');
        const resultArray: string[] = [];
        idPlayerMapper
          .getPlayers()
          .forEach((v, k) =>
            resultArray.push(
              `${v.discordUser().username}: ${v.getPoints()} points`
            )
          );
        resultEmbed.addField('Results', resultArray.join('\n'));

        message.channel.send(resultEmbed);
        break;
      case 'restart':
        if (botAdmin.indexOf(message.author.id) < 0)
          message.channel.send('You are not the superadmin of the bot');
        else {
          partyMap = new Map();
          message.channel.send('Bot has been restarted');
        }
        break;
      case 'rule':
        const ruleEmbed = new Discord.MessageEmbed();
        ruleEmbed.setTitle('Game rule');
        ruleEmbed.addField(
          'Rule',
          `
        - If you are a mafia and your team loses, you will gain 3 points.
        - If you are a non-mafia, you will gain 1 point if you win.
        - If you vote a mafia (as a non-mafia), you will gain 1 point. Mafia will lose 1 point for each vote.
        - You can't vote for yourself.
        `
        );
        message.channel.send(ruleEmbed);
        break;
      case 'commands':
      case 'help':
        const embed = new Discord.MessageEmbed();
        const allcmds = [
          'create',
          'cancel (-f for force cancel, server admin only)',
          'join',
          'leave',
          'players',
          'win <A / B>',
          'remake',
          'vote <@user>',
          `commands (alias: ${prefix}help)`,
          'kick <@user>',
          'rule',
          'restart (admin only)',
        ];
        embed.setTitle('Commands list');
        embed.addField(
          'Commands',
          allcmds.map((it) => `${prefix}${it}`).join('\n')
        );
        embed.setFooter(
          'Want to contribute or give feedback? Create an issue on my GitHub https://github.com/daftmaple/rocket-league-mafia-bot'
        );
        message.channel.send(embed);
        break;
      case 'version':
        message.channel.send(
          `Current version: ${process.env.npm_package_version}`
        );
        break;
      case 'invite':
        message.channel.send(
          'Invite for this bot is disabled. Please ask bot operator for invite.'
        );
        break;
      case 'changelog':
        const changelogs = new Discord.MessageEmbed();
        changelogs.setTitle('Recent changelogs');
        changelogs.addFields([
          {
            name: 'Version 1.2.0',
            value: `
            - Allow user to cancel if a party is cancellable
(inactive for more than 10 minutes)
            - Added game rule
            - (Internal change) slightly modify party handling
            `,
          },
          {
            name: 'Version 1.2.1',
            value: `
            - As server admin, you can cancel party forcefully using -f option
            - Bugfix where someone can vote without being in the party
            `,
          },
          {
            name: 'Version 1.2.2',
            value: `
            Internal minor bugfix where party leader can't vote
            `,
          },
          {
            name: 'Version 1.2.3',
            value: `
            Internal minor bugfix where game doesn't end after 60 seconds
            `,
          },
        ]);
        changelogs.setFooter(
          `Check this bot on my GitHub https://github.com/daftmaple/rocket-league-mafia-bot`
        );
        message.channel.send(changelogs);
        break;
      default:
        return;
    }
  }
});

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

client.login(process.env.BOT_TOKEN!);

client.on('ready', () => {
  if (client.user)
    client.user.setPresence({
      activity: {
        name: `${prefix}help | version ${process.env.npm_package_version}`,
        type: 'PLAYING',
      },
    });
});
