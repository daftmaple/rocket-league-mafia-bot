import dotenv from 'dotenv';

dotenv.config();

import Discord from 'discord.js';
import { MessageError } from './types';
import { Repository } from './ignore/repository';
import { commandMap } from './handler';

const prefix = process.env.BOT_PREFIX || 'm!';

const client: Discord.Client = new Discord.Client({
  retryLimit: 3,
});

const repo = new Repository();

client.on('message', async (message: Discord.Message) => {
  if (message.content.startsWith(prefix)) {
    const cmds: string[] = message.content
      .slice(prefix.length)
      .trim()
      .split(/\s+/);

    if (!(message.channel instanceof Discord.TextChannel)) return;

    const functionHandler = commandMap.get(cmds[0]);

    if (!!functionHandler) {
      try {
        functionHandler(message, repo, cmds, client);
      } catch (e) {
        if (e instanceof Error && !!e.stack) console.error(e.stack);
        if (e instanceof MessageError) message.channel.send(e.message);
      }
    }
  }
});

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
