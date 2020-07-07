import dotenv from 'dotenv';

dotenv.config();

import Discord from 'discord.js';
import { Party, PlayerMap } from './types';
import { CallbackTest } from './test';

const prefix = process.env.BOT_PREFIX || 'm!';

const idPlayerMapper = new PlayerMap();
let currentParty: Party | null = null;

let test: CallbackTest | null = null;

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
    switch (cmds[0]) {
      case 'create':
        if (currentParty) message.channel.send('There is an ongoing party');
        message.channel.send('Creating a party');
        currentParty = new Party(message.channel.id, currentPlayer);
        break;
      case 'cancel':
        if (!currentParty) message.channel.send('There is no ongoing party');
        else if (currentParty.ongoingGame())
          message.channel.send('There is an ongoing game');
        else if (!currentParty.isLeader(currentPlayer))
          message.channel.send('User is not the party leader');
        else {
          currentParty = null;
          message.channel.send('Party has been disbanded');
        }
        break;
      case 'players':
        if (!currentParty) message.channel.send('There is no ongoing party');
        else {
          const embed = new Discord.MessageEmbed();
          embed.setDescription('List of players in the party');
          embed.addField(
            'Current players:',
            currentParty
              .getPlayers()
              .map((it) => it.discordUser().username)
              .join('\n')
          );
          message.channel.send(embed);
        }
        break;
      case 'start':
      case 'remake':
        if (!currentParty) {
          message.channel.send('There is no ongoing party');
          return;
        }
        try {
          const game = currentParty.startGame();

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
        if (!currentParty) {
          message.channel.send('There is no ongoing party');
          return;
        }
        try {
          currentParty.addPlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${
              currentPlayer.discordUser().username
            } has joined the party`
          );
          embed.addField(
            'Current players:',
            currentParty
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
        if (!currentParty) {
          message.channel.send('There is no ongoing party');
          return;
        }
        try {
          currentParty.removePlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${currentPlayer.discordUser().username} has left the party`
          );
          embed.addField(
            'Current players:',
            currentParty
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
        else if (!currentParty) {
          message.channel.send('There is no ongoing party');
        } else {
          const winnerIndex = cmds[1].toLowerCase() === 'a' ? 0 : 1;
          try {
            let allVoted = false;
            currentParty.startVote(winnerIndex, (result) => {
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
            const players = currentParty.getPlayers();
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
              message.channel.send(
                `You have ${60 - counter * 15} seconds left`
              );
            }, 15 * 1000);

            await sleep(60 * 1000);
            await message.channel.send('Voting is over');

            currentParty.endGame();
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
        break;
      case 'vote':
        if (!cmds[1]) {
          message.channel.send(`Usage: \`${prefix}vote <@player>\``);
        } else if (!currentParty) {
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
            currentParty.playerVote(currentPlayer, votedPlayer);
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
      case 'points':
        if (!currentParty) {
          message.channel.send('There is no ongoing party');
        } else {
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
        }
        break;
      case 'restart':
        currentParty = null;
        break;
      case 'commands':
      case 'help':
        const embed = new Discord.MessageEmbed();
        const allcmds = [
          'create',
          'cancel',
          'join',
          'leave',
          'players',
          'win <A / B>',
          'remake',
          'vote <@user>',
          `commands (alias: ${prefix}help)`,
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
        message.channel.send(`Current version: 1.0.5`);
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
