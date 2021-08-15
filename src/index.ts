import assert from 'assert';
import axios from 'axios';
import cors from 'cors';
import express, { RequestHandler } from 'express';
import { Player, PlayerResponse } from 'hypixel-types';
import RedisClient from 'ioredis';
import morgan from 'morgan';
import responseTime from 'response-time';
import { HypixelCacheResponse } from './types';

interface MojangAPIResponse {
  name?: string;
  id?: string;
  error?: string;
  errorMessage?: string;
  legacy?: true;
  demo?: true;
}

type CacheHandler = RequestHandler<{ identifier: string; type: string }, HypixelCacheResponse>;

const PORT = 5000;
const redis = new RedisClient(process.env.REDIS_URL);
const app = express();

app.set('trust proxy', true);
app.use(responseTime());
app.use(morgan('short'));
app.use(cors({ exposedHeaders: ['X-Response-Time'] }));

const makeResponse = ({
  player,
  cached,
  fetchedAt,
}: {
  player: Player;
  cached: boolean;
  fetchedAt: Date | number;
}): HypixelCacheResponse => ({
  success: true,
  cached,
  fetchedAt: new Date(fetchedAt).toISOString(),
  username: player.displayname,
  uuid: player.uuid,
  player,
});

const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const authenticate: CacheHandler = async (req, res, next) => {
  const key = req.headers['x-secret'];

  if (key !== process.env.HYPIXEL_CACHE_SECRET)
    return res.status(401).json({ success: false, error: 'Invalid API key' });

  next();
};

const findCached: CacheHandler = async (req, res, next) => {
  const { identifier, type } = req.params;

  let uuid: string;

  if (type === 'uuid') {
    if (!uuidRegex.test(identifier))
      return res.status(400).json({
        success: false,
        error: 'Invalid UUID',
      });
    uuid = identifier;
  } else if (type === 'name') {
    const json = await redis.get(identifier.toLowerCase());
    if (!json) return next();
    const { id } = JSON.parse(json);
    uuid = id;
  } else {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  uuid = uuid.replace(/-/g, '');

  const cached = await redis.get(uuid);

  if (cached) {
    const { fetchedAt, player } = JSON.parse(cached);
    return res.json(makeResponse({ player, cached: true, fetchedAt }));
  } else {
    next();
  }
};

const fetchFromApi: CacheHandler = async (req, res, next) => {
  try {
    const { identifier, type } = req.params;

    let uuid: string;

    if (type === 'uuid') {
      if (!uuidRegex.test(identifier))
        res.status(400).json({
          success: false,
          error: 'Invalid UUID',
        });

      uuid = identifier;
    } else if (type === 'name') {
      if (!/\w{3,16}/.test(identifier))
        return res.status(400).json({ success: false, error: 'Invalid username' });

      // resolve to UUID
      const response = await axios.get(
        `https://api.mojang.com/users/profiles/minecraft/${identifier}`,
        { validateStatus: () => true }
      );
      const data = response.data as MojangAPIResponse;

      if (response.status === 204 || data.demo) {
        return res.status(404).json({ success: false, error: 'Player not found' });
      }

      if (data.error) {
        throw new Error(`UUID resolution failed: ${data.error}: ${data.errorMessage}`);
      }

      const { id, name: username } = data as Required<MojangAPIResponse>;

      assert.equal(
        username.toLowerCase(),
        identifier.toLowerCase(),
        'Provided and resolved username mismatch'
      );

      redis.setex(username.toLowerCase(), 3600, JSON.stringify({ username, id }));

      uuid = id;
    } else {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    uuid = uuid.replace(/-/g, '');

    const response = await axios.get('https://api.hypixel.net/player', {
      params: {
        key: process.env.HYPIXEL_API_KEY,
        uuid: encodeURIComponent(uuid),
      },
      validateStatus: () => true,
    });

    const fetchedAt = Date.now();
    const data = response.data as PlayerResponse;

    if (response.status !== 200 || !data.success) {
      if (response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Ratelimited, try again later',
        });
      } else {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
    }

    redis.setex(uuid, 60 * 5, JSON.stringify({ fetchedAt, player: data.player }));

    if (data.player) {
      res.json(makeResponse({ player: data.player, cached: false, fetchedAt }));
    } else {
      res.status(404).json({ success: false, error: 'Player not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

app.get('/:type/:identifier', authenticate, findCached, fetchFromApi);

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, () => console.log('Listening on port ' + PORT));
