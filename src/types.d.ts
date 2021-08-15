import { Player } from 'hypixel-types';

export type HypixelCacheResponse = CacheSuccessResponse | CacheFailResponse;

export interface CacheSuccessResponse {
  success: true;
  cached: boolean;
  fetchedAt: string;
  username: string;
  uuid: string;
  player: Player;
}

export interface CacheFailResponse {
  success: false;
  error: string;
}
