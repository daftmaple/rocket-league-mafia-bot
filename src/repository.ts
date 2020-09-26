import { Party, Player, MessageError } from './types';
import Discord from 'discord.js';

export class Repository {
  private _playerMap: PlayerMap;
  private _partyMap: Map<Discord.Snowflake, Party>;

  constructor() {
    this._playerMap = new PlayerMap();
    this._partyMap = new Map();
  }

  restart = (): void => {
    this._partyMap = new Map();
  };

  getPlayer = (user: Discord.User): Player => {
    return this._playerMap.addOrFindPlayer(user);
  };

  getPlayers = (): Map<string, Player> => {
    return this._playerMap.getPlayers();
  };

  getParty = (channelId: Discord.Snowflake): Party | undefined => {
    return this._partyMap.get(channelId);
  };

  newParty = (channelId: Discord.Snowflake, leader: Player): void => {
    if (this._partyMap.get(channelId))
      throw new MessageError('Party is already set for this channel');
    this._partyMap.set(channelId, new Party(leader));
  };

  deleteParty = (channelId: Discord.Snowflake): void => {
    if (this._partyMap.get(channelId)?.ongoingGame())
      throw new MessageError('There is an ongoing game for this party');
    this._partyMap.delete(channelId);
  };
}

class PlayerMap {
  private players: Map<string, Player>;
  constructor() {
    this.players = new Map();
  }

  addOrFindPlayer = (user: Discord.User): Player => {
    const player = this.players.get(user.id);
    if (player) {
      return player;
    } else {
      const p = new Player(user);
      this.players.set(user.id, p);
      return p;
    }
  };

  getPlayers = (): Map<string, Player> => {
    return this.players;
  };
}
