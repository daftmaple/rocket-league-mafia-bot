import Discord from 'discord.js';
import { MessageFunction, MessageError, Player } from './types';
import { Repository } from './repository';

const prefix = process.env.BOT_PREFIX || 'm!';
const botAdmins = (process.env.BOT_ADMIN || '').split(',');

const sleep = (ms: number): Promise<unknown> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const mention = (player: Player, message: string): string => {
  return `<@${player.discordUser().id}> ${message}`;
};

const changelog: MessageFunction = (message: Discord.Message): void => {
  const embed = new Discord.MessageEmbed();
  embed.setTitle('Recent changelogs');
  embed.addFields([
    {
      name: 'Version 1.2.4',
      value: `Internal structure change to support future extensibility`,
    },
    {
      name: 'Version 1.2.3',
      value: `Internal minor bugfix where game doesn't end after 60 seconds`,
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
      value: `Internal minor bugfix where party leader can't vote`,
    },
    {
      name: 'Version 1.2.0',
      value: `
            - Allow user to cancel if a party is cancellable
(inactive for more than 10 minutes)
            - Added game rule
            - (Internal change) slightly modify party handling
            `,
    },
  ]);
  embed.setFooter(
    `Check this bot on my GitHub https://github.com/daftmaple/rocket-league-mafia-bot`
  );
  message.channel.send(embed);
};

const invite: MessageFunction = (message: Discord.Message): void => {
  message.channel.send(
    'Invite for this bot is disabled. Please ask bot operator for invite.'
  );
};

const version: MessageFunction = (message: Discord.Message): void => {
  message.channel.send(`Current version: ${process.env.npm_package_version}`);
};

const help: MessageFunction = (message: Discord.Message): void => {
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
  embed.addField('Commands', allcmds.map((it) => `${prefix}${it}`).join('\n'));
  embed.setFooter(`Current version: ${process.env.npm_package_version}`);
  message.channel.send(embed);
};

const rule: MessageFunction = (message: Discord.Message): void => {
  const embed = new Discord.MessageEmbed();
  embed.setTitle('Game rule');
  embed.addField(
    'Rule',
    `
        - If you are a mafia and your team loses, you will gain 3 points.
        - If you are a non-mafia, you will gain 1 point if you win.
        - If you vote a mafia (as a non-mafia), you will gain 1 point. Mafia will lose 1 point for each vote.
        - You can't vote for yourself.
        `
  );
  message.channel.send(embed);
};

const create = (message: Discord.Message, repo: Repository): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!!party) {
    message.channel.send('There is an ongoing party in this channel');
    return;
  }
  message.channel.send('Creating a party for this channel');

  repo.newParty(channelId, player);
};

const cancel = (
  message: Discord.Message,
  repo: Repository,
  cmds: string[]
): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party in this channel');
    return;
  }

  if (party.ongoingGame()) {
    message.channel.send('There is an ongoing game');
    return;
  }

  if (
    !party.isLeader(player) &&
    message.member?.hasPermission('ADMINISTRATOR')
  ) {
    if (cmds[1] !== '-f') {
      message.channel.send(
        mention(
          player,
          `To cancel currently running party as server administrator, use \`${prefix}cancel -f\``
        )
      );
    } else {
      repo.deleteParty(channelId);
      message.channel.send('Party has been disbanded forcefully');
    }
    return;
  }

  if (!party.isLeader(player) && !party.cancellable()) {
    message.channel.send(
      'User is not the party leader and last action (game/join/leave) was less than 10 minutes ago'
    );
    return;
  }

  repo.deleteParty(channelId);
  message.channel.send('Party has been disbanded');
};

const status = (message: Discord.Message, repo: Repository): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);

  if (!party) {
    message.channel.send('There is no ongoing party in this channel');
    return;
  }

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
};

const start = (message: Discord.Message, repo: Repository): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);

  if (!party) {
    message.channel.send('There is no ongoing party in this channel');
    return;
  }

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
};

const join = (message: Discord.Message, repo: Repository): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party in this channel');
    return;
  }

  party.addPlayer(player);
  const embed = new Discord.MessageEmbed();
  embed.setDescription(
    `Player ${player.discordUser().username} has joined the party`
  );
  embed.addField(
    'Current players:',
    party
      .getPlayers()
      .map((it) => it.discordUser().username)
      .join('\n')
  );
  message.channel.send(embed);
};

const leave = (message: Discord.Message, repo: Repository): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party in this channel');
    return;
  }

  party.removePlayer(player);
  const embed = new Discord.MessageEmbed();
  embed.setDescription(
    `Player ${player.discordUser().username} has left the party`
  );
  embed.addField(
    'Current players:',
    party
      .getPlayers()
      .map((it) => it.discordUser().username)
      .join('\n')
  );
  message.channel.send(embed);
};

const kick = (
  message: Discord.Message,
  repo: Repository,
  cmds: string[],
  client: Discord.Client
): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party');
    return;
  }

  if (!cmds[1]) {
    message.channel.send(`Usage: \`${prefix}kick <@player>\``);
    return;
  }

  if (!party.isLeader(player)) {
    message.channel.send('User is not party leader for this channel');
    return;
  }
  let mention = cmds[1];
  if (mention.startsWith('<@') && mention.endsWith('>')) {
    mention = mention.slice(2, -1);

    if (mention.startsWith('!')) {
      mention = mention.slice(1);
    }
  }

  const mentionedUser = client.users.cache.get(mention);
  if (!mentionedUser)
    throw new MessageError('The mentioned user does not exist');

  const mentionedPlayer = repo.getPlayer(mentionedUser);
  party.removePlayer(mentionedPlayer);
  message.channel.send(
    `User ${
      mentionedPlayer.discordUser().username
    } has been removed from current party`
  );
};

const points = (message: Discord.Message, repo: Repository): void => {
  const embed = new Discord.MessageEmbed();
  embed.setTitle('Current standing');
  const resultArray: string[] = [];
  repo
    .getPlayers()
    .forEach((v) =>
      resultArray.push(`${v.discordUser().username}: ${v.getPoints()} points`)
    );
  embed.addField('Results', resultArray.join('\n'));

  message.channel.send(embed);
};

const restart = (message: Discord.Message, repo: Repository): void => {
  if (botAdmins.indexOf(message.author.id) < 0)
    message.channel.send('You are not the superadmin of the bot');
  else {
    repo.restart();
    message.channel.send('Bot has been restarted');
  }
};

const win = async (
  message: Discord.Message,
  repo: Repository,
  cmds: string[]
): Promise<void> => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party');
    return;
  }

  if (
    !cmds[1] ||
    !(cmds[1].toLowerCase() === 'a' || cmds[1].toLowerCase() === 'b')
  ) {
    message.channel.send(mention(player, `Usage: \`${prefix}win <A / B>\``));
    return;
  }

  const winnerIndex = cmds[1].toLowerCase() === 'a' ? 0 : 1;

  // Since win command is asynchronous, wrap logic with try-catch
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
    embed.setDescription('Voting ends in 60 seconds or all players have voted');
    embed.addField(
      'Players',
      players.map((it) => it.discordUser().username).join('\n')
    );
    await message.channel.send(embed);

    let counter = 0;
    const interval = setInterval(() => {
      counter++;
      if (counter === 3 || allVoted) clearInterval(interval);
      else message.channel.send(`You have ${60 - counter * 15} seconds left`);
    }, 15 * 1000);

    setTimeout(() => {
      if (!allVoted) {
        message.channel.send('Voting is over');
        party.endGame();
      }
    }, 60 * 1000);
  } catch (e) {
    if (e instanceof MessageError) message.channel.send(e.message);
  }
};

const vote = (
  message: Discord.Message,
  repo: Repository,
  cmds: string[],
  client: Discord.Client
): void => {
  const channelId = message.channel.id;
  const party = repo.getParty(channelId);
  const player = repo.getPlayer(message.author);

  if (!party) {
    message.channel.send('There is no ongoing party');
    return;
  }

  if (!cmds[1]) {
    message.channel.send(`Usage: \`${prefix}vote <@player>\``);
  }

  let mention = cmds[1];
  if (mention.startsWith('<@') && mention.endsWith('>')) {
    mention = mention.slice(2, -1);

    if (mention.startsWith('!')) {
      mention = mention.slice(1);
    }
  }

  const votedUser = client.users.cache.get(mention);
  if (!votedUser) throw new MessageError('The mentioned user does not exist');

  const votedPlayer = repo.getPlayer(votedUser);
  party.playerVote(player, votedPlayer);
  message.channel.send(
    `${player.discordUser().username} voted for ${
      votedPlayer.discordUser().username
    }`
  );
};

const commandRecord = {
  changelog: changelog,
  invite: invite,
  version: version,
  commands: help,
  help: help,
  rule: rule,
  create: create,
  cancel: cancel,
  status: status,
  players: status,
  start: start,
  remake: start,
  join: join,
  leave: leave,
  kick: kick,
  points: points,
  restart: restart,
  win: win,
  vote: vote,
};

export const commandMap = new Map<string, MessageFunction>(
  Object.entries(commandRecord)
);
