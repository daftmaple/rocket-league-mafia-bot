import Discord from 'discord.js';

export type GameResult = {
  players: Map<Player, number>;
  mafia: Player;
};

export type EndgameCallback = (result: GameResult) => void;

export class Match {
  private players: Player[];
  private leader: Player;
  private game: Game | null;
  private callback: EndgameCallback | null;

  constructor(channel: string, leader: Player) {
    this.players = [];
    this.leader = leader;
    this.game = null;
    this.callback = null;
  }

  addPlayer(player: Player) {
    if (this.leader === player || this.players.indexOf(player) !== -1) {
      throw new Error('Player is already in the match');
    } else if (this.players.length < 5) {
      this.players.push(player);
    } else {
      throw new Error('Team is full');
    }
  }

  getPlayers() {
    return Array.from([this.leader, ...this.players]);
  }

  removePlayer(player: Player) {
    if (this.game) throw new Error("Can't remove player when game is still on");
    else if (this.leader === player) {
      throw new Error("You can't leave your match");
    } else if (this.players.indexOf(player) === -1) {
      throw new Error('Player is not in the match');
    } else {
      this.players.splice(this.players.indexOf(player));
    }
  }

  startGame() {
    if (this.game)
      throw new Error('A game has been started. Finish the ongoing game');
    else if (this.players.length !== 5)
      throw new Error(
        `Not enough players (currently ${this.players.length + 1} players)`
      );
    this.game = new Game([...this.players, this.leader]);
    return this.game;
  }

  startVote(callback: EndgameCallback) {
    if (!this.game) throw new Error('There is no ongoing game');
    this.game.startVote();
    this.callback = callback;
  }

  getGame() {
    return this.game;
  }

  playerVote(fromVote: Player, voting: Player) {
    if (!this.game) throw new Error('There is no ongoing game');
    const c = this.game.playerVote(fromVote, voting);
    if (c >= this.players.length + 1) {
      this.endGame();
    }
  }

  setGameWinner(winnerIndex: number) {
    if (!this.game) throw new Error('There is no ongoing game');
    this.game.setGameWinner(winnerIndex);
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
  }

  ongoingGame() {
    return !!this.game;
  }

  isLeader(player: Player) {
    return this.leader === player;
  }
}

export abstract class GameState {

}

export class Game {
  private mafia: Player;
  private others: Player[];

  private teamMafia: Player[];
  private teamNotMafia: Player[];

  private mafiaIndex: number | null;
  private winnerIndex: number | null;
  private userNameList: string[][] | null;

  private vote: Map<Player, Player> | null;
  private gameOver: boolean;

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
    this.mafiaIndex = null;
    this.winnerIndex = null;
    this.userNameList = null;

    this.vote = null;
    this.gameOver = false;
  }

  startVote() {
    if (!!this.vote) throw new Error('Vote has been started');
    this.vote = new Map();
  }

  playerVote(fromVote: Player, voting: Player) {
    if (this.gameOver) throw new Error('Game is already finished');
    if (!this.vote)
      throw new Error(
        "Vote hasn't been started yet. Set winner for current game"
      );
    this.vote.set(fromVote, voting);
    return this.vote.size;
  }

  setGameWinner(winnerIndex: number) {
    if (!this.mafiaIndex) throw new Error("Game hasn't started yet");
    this.winnerIndex = winnerIndex;
  }

  // Do points calculation
  endGame(): Map<Player, number> {
    if (this.gameOver) throw new Error('Game has ended');
    else if (!this.vote)
      throw new Error(
        "Vote hasn't been started yet. Set winner for current game"
      );
    this.gameOver = true;

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
    this.others.forEach((it) => players_points.set(it, 0));

    // Set the points based on correct vote
    this.vote!.forEach((value, key) => {
      if (value === this.mafia) {
        players_points.set(key, players_points.get(key)! + 1);
        players_points.set(value, players_points.get(value)! - 1);
      }
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
    if (this.userNameList) return this.userNameList;
    else if (!!this.vote)
      throw new Error('Vote for a game is currently running');

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

    return this.userNameList;
  }

  getMafiaIndex() {
    if (!this.mafiaIndex) this.getUserNameList();
    return this.mafiaIndex!;
  }

  private shuffleArray(array: any) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
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
}

export class PlayerMap {
  private players: Map<string, Player>;
  constructor() {
    this.players = new Map();
  }

  addOrFindPlayer(user: Discord.User) {
    if (this.players.has(user.id)) {
      return this.players.get(user.id)!;
    } else {
      const p = new Player(user);
      this.players.set(user.id, p);
      return p;
    }
  }
}
