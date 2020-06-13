import dotenv from 'dotenv';

dotenv.config();

import Discord from 'discord.js';
import { Match, Player, PlayerMap } from './types';
import { CallbackTest } from './test';

const prefix = process.env.BOT_PREFIX || 'm!';

const idPlayerMapper = new PlayerMap();
let currentMatch: Match | null = null;

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
        if (currentMatch) message.channel.send('There is an ongoing match');
        message.channel.send('Creating a match');
        currentMatch = new Match(message.channel.id, currentPlayer);
        break;
      case 'cancel':
        if (!currentMatch) message.channel.send('There is no ongoing match');
        else if (currentMatch.ongoingGame())
          message.channel.send('There is an ongoing game');
        else if (!currentMatch.isLeader(currentPlayer))
          message.channel.send('User is not the party leader');
        else {
          currentMatch = null;
          message.channel.send('Match has been disbanded');
        }
        break;
      case 'players':
        if (!currentMatch) message.channel.send('There is no ongoing match');
        else {
          const embed = new Discord.MessageEmbed();
          embed.setDescription('List of players in the match');
          embed.addField(
            'Current players:',
            currentMatch
              .getPlayers()
              .map((it) => it.discordUser().username)
              .join('\n')
          );
          message.channel.send(embed);
        }
        break;
      case 'start':
      case 'remake':
        if (!currentMatch) {
          message.channel.send('There is no ongoing match');
          return;
        }
        try {
          const game = currentMatch.startGame();

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
        if (!currentMatch) {
          message.channel.send('There is no ongoing match');
          return;
        }
        try {
          currentMatch.addPlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${
              currentPlayer.discordUser().username
            } has joined the match`
          );
          embed.addField(
            'Current players:',
            currentMatch
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
        if (!currentMatch) {
          message.channel.send('There is no ongoing match');
          return;
        }
        try {
          currentMatch.removePlayer(currentPlayer);
          const embed = new Discord.MessageEmbed();
          embed.setDescription(
            `Player ${currentPlayer.discordUser().username} has left the match`
          );
          embed.addField(
            'Current players:',
            currentMatch
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
          message.channel.send(`Usage: \`${prefix}win <team A/B>\``);
        else if (!currentMatch) {
          message.channel.send('There is no ongoing match');
        } else {
          const winnerIndex = cmds[1].toLowerCase() === 'a' ? 0 : 1;
          try {
            currentMatch.setGameWinner(winnerIndex);
            let allVoted = false;
            currentMatch.startVote((result) => {
              allVoted = true;
              message.channel.send(
                `The mafia is ${result.mafia.discordUser().username}`
              );

              const resultEmbed = new Discord.MessageEmbed();
              resultEmbed.setTitle('Game result');
              const resultArray: string[] = [];
              result.players.forEach((v, k) =>
                resultArray.push(`${k.discordUser().username}: ${v} points`)
              );
              resultEmbed.addField('Results', resultArray.join('\n'));
            });
            const players = currentMatch.getPlayers();
            const embed = new Discord.MessageEmbed();
            embed.setTitle('Vote for mafia');
            embed.setDescription(
              'Voting ends in 60 seconds or all players have voted'
            );
            embed.addField('Players', players.join('\n'));
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

            currentMatch.endGame();
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
        break;
      case 'vote':
        if (!cmds[1]) {
          message.channel.send(`Usage: \`${prefix}vote <@player>\``);
        } else if (!currentMatch) {
          message.channel.send('There is no ongoing match');
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
            currentMatch.playerVote(currentPlayer, votedPlayer);
          } catch (e) {
            if (e instanceof Error) message.channel.send(e.message);
          }
        }
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
          'win <team>',
          'remake',
          'vote <@user>',
          `commands (alias: ${prefix}help)`,
        ];
        embed.setTitle('Commands list');
        embed.addField(
          'Commands',
          allcmds.map((it) => `${prefix}${it}`).join('\n')
        );
        message.channel.send(embed);
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
