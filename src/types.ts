/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Discord from 'discord.js';
import moment from 'moment';
import { Repository } from './repository';

export type GameResult = {
  players: Map<Player, number>;
  mafia: Player;
};

export type EndgameCallback = (result: GameResult) => void;

export class Party {
  private players: Player[];
  private leader: Player;
  private game: Game | null;
  private callback: EndgameCallback | null;
  private lastAction: Date;

  constructor(leader: Player) {
    this.players = [];
    this.leader = leader;
    this.game = null;
    this.callback = null;
    this.lastAction = new Date();
  }

  addPlayer(player: Player) {
    if (this.leader === player || this.players.indexOf(player) >= 0) {
      throw new Error('Player is already in the party');
    } else if (this.players.length < 5) {
      this.players.push(player);
    } else {
      throw new Error('Team is full');
    }
    this.lastAction = new Date();
  }

  getPlayers() {
    return Array.from([this.leader, ...this.players]);
  }

  removePlayer(player: Player) {
    if (this.game) throw new Error("Can't remove player when game is still on");
    else if (this.leader === player) {
      throw new Error("You can't leave your party");
    } else if (this.players.indexOf(player) < 0) {
      throw new Error('Player is not in the party');
    } else {
      this.players.splice(this.players.indexOf(player), 1);
    }
    this.lastAction = new Date();
  }

  startGame() {
    if (this.game)
      throw new Error('A game has been started. Finish the ongoing game');
    else if (this.players.length !== 5)
      throw new Error(
        `Not enough players (currently ${this.players.length + 1} players)`
      );
    this.game = new Game([...this.players, this.leader]);
    this.lastAction = new Date();
    return this.game;
  }

  startVote(winnerIndex: number, callback: EndgameCallback) {
    if (!this.game) throw new Error('There is no ongoing game');
    this.game.startVote(winnerIndex);
    this.callback = callback;
  }

  playerVote(fromVote: Player, voting: Player) {
    if (!this.game) throw new Error('There is no ongoing game');
    if (this.getPlayers().indexOf(fromVote) < 0)
      throw new Error('You are not in the party');
    if (this.getPlayers().indexOf(voting) < 0)
      throw new Error('The player that you voted is not in the party');
    if (fromVote === voting) throw new Error("You can't vote for yourself");
    const c = this.game.playerVote(fromVote, voting);
    if (c >= this.players.length + 1) {
      this.endGame();
    }
  }

  endGame() {
    if (!this.game) return;
    const g = this.game.endGame();
    const m = this.game.getMafia();

    this.game = null;
    const result: GameResult = {
      players: g,
      mafia: m,
    };
    this.callback!(result);

    this.lastAction = new Date();
  }

  ongoingGame() {
    return !!this.game;
  }

  // Party is cancellable if no ongoing game and last action was more than 10 minutes ago
  cancellable(): boolean {
    return (
      !this.game &&
      new Date().getTime() - this.lastAction.getTime() > 10 * 60 * 1000
    );
  }

  whenLastActive(): string {
    const endMoment = moment(new Date());
    const startMoment = moment(this.lastAction);

    const d = endMoment.diff(startMoment, 'days');
    startMoment.add(d, 'days');
    const h = endMoment.diff(startMoment, 'hours');
    startMoment.add(h, 'hours');
    const min = endMoment.diff(startMoment, 'minutes');
    startMoment.add(min, 'minutes');
    const s = endMoment.diff(startMoment, 'seconds');
    startMoment.add(s, 'seconds');

    const sep = [];
    d && sep.push(d === 1 ? '1 day' : `${d} days`);
    h && sep.push(h === 1 ? '1 hour' : `${h} hours`);
    min && sep.push(min === 1 ? '1 minute' : `${min} minutes`);
    s && sep.push(s === 1 ? '1 second' : `${s} seconds`);

    return sep.join(', ');
  }

  isLeader(player: Player) {
    return this.leader === player;
  }
}

class Game {
  private mafia: Player;
  private others: Player[];

  private teamMafia: Player[];
  private teamNotMafia: Player[];

  private mafiaIndex: number | null;
  private winnerIndex: number | null;
  private userNameList: string[][];

  private vote: Map<Player, Player>;

  private gameState: State;

  constructor(players: Player[]) {
    const arr = Array.from(players);
    this.mafia = arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
    this.others = Array.from(arr);

    this.teamMafia = [];
    this.teamMafia.push(this.mafia);
    const withMafia1 = arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
    const withMafia2 = arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
    this.teamMafia.push(withMafia1);
    this.teamMafia.push(withMafia2);

    this.teamNotMafia = arr;

    const teamMafiaUserString = this.teamMafia.map(
      (it) => it.discordUser().username
    );
    const teamOthersUserString = this.teamNotMafia.map(
      (it) => it.discordUser().username
    );

    this.shuffleArray(teamMafiaUserString);
    this.shuffleArray(teamOthersUserString);

    this.userNameList = [teamMafiaUserString, teamOthersUserString];
    this.shuffleArray(this.userNameList);
    this.mafiaIndex = this.userNameList.indexOf(teamMafiaUserString);

    this.winnerIndex = null;
    this.vote = new Map();

    this.gameState = new StartedState(this);
  }

  setState(state: State) {
    this.gameState = state;
  }

  startVote(winnerIndex: number) {
    this.gameState.startVote();
    this.winnerIndex = winnerIndex;
  }

  playerVote(fromVote: Player, voting: Player) {
    this.gameState.playerVote();
    this.vote.set(fromVote, voting);
    return this.vote.size;
  }

  // Do points calculation
  endGame(): Map<Player, number> {
    this.gameState.endGame();

    /*
    the point system should be 3 points for mafia if he loses 
    and -1 for mafia for each vote that guesses him
    1 point for everyone that guesses mafia
    */

    // Calculate points of the mafia based on whether the mafia wins/loses the game
    const players_points = new Map<Player, number>();
    players_points.set(
      this.mafia,
      this.winnerIndex! !== this.mafiaIndex! ? 3 : 0
    );
    this.others.forEach((it) => {
      // If non-mafia wins, they will get 1 point
      // Find player in teamMafia, because !!find will be true/false
      // If player in teamMafia and winnerIndex === mafiaIndex, set point to 1, otherwise 0
      // Else (!player in teamMafia) and winnerIndex !== mafiaIndex, set point to 1 otherwise 0
      players_points.set(
        it,
        this.teamMafia.find((player) => player === it)
          ? this.winnerIndex === this.mafiaIndex
            ? 1
            : 0
          : this.winnerIndex !== this.mafiaIndex
          ? 1
          : 0
      );
    });

    // Set the points based on correct vote
    this.vote!.forEach((value, key) => {
      if (value === this.mafia) {
        players_points.set(key, players_points.get(key)! + 1);
        players_points.set(value, players_points.get(value)! - 1);
      }
    });

    players_points.forEach((v, k) => {
      k.addPoints(v);
    });

    return players_points;
  }

  getMafia() {
    return this.mafia;
  }

  getOthers() {
    return this.others;
  }

  getUserNameList() {
    return this.userNameList;
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

abstract class State {
  // Set game winner happens before vote
  abstract startVote(): void;
  abstract playerVote(): void;
  abstract endGame(): void;
}

class StartedState implements State {
  private game: Game;
  constructor(game: Game) {
    this.game = game;
  }
  startVote(): void {
    this.game.setState(new VotingState(this.game));
    return;
  }
  playerVote(): void {
    throw new Error('Winner must be set first.');
  }
  endGame(): void {
    throw new Error('Winner must be set first.');
  }
}

class VotingState implements State {
  private game: Game;
  constructor(game: Game) {
    this.game = game;
  }
  startVote(): void {
    throw new Error('Vote is already started.');
  }
  playerVote(): void {
    return;
  }
  endGame(): void {
    this.game.setState(new EndedState(this.game));
    return;
  }
}

class EndedState implements State {
  private game: Game;
  constructor(game: Game) {
    this.game = game;
  }
  startVote(): void {
    throw new Error('Game has ended.');
  }
  playerVote(): void {
    throw new Error('Game has ended.');
  }
  endGame(): void {
    return;
  }
}

export class Player {
  private user: Discord.User;
  private points: number;
  constructor(user: Discord.User) {
    this.user = user;
    this.points = 0;
  }

  discordUser() {
    return this.user;
  }

  addPoints(point: number) {
    this.points = this.points + point;
  }

  getPoints() {
    return this.points;
  }
}

export class MessageError extends Error {
  constructor(m: string) {
    super(m);
    Object.setPrototypeOf(this, MessageError.prototype);
  }
}

export type MessageFunction = (
  message: Discord.Message,
  repo: Repository,
  cmds: string[],
  client: Discord.Client
) => void;
