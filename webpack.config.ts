import ForkTsCheckerPlugin from 'fork-ts-checker-webpack-plugin';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { BannerPlugin, Configuration, EnvironmentPlugin } from 'webpack';

export const devMode = process.env.NODE_ENV !== 'production';

export default <Configuration>{
  target: 'async-node',
  entry: './src/index.ts',
  mode: devMode ? 'development' : 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs',
    chunkFilename: '[name].js',
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]?[hash]',
    pathinfo: false,
  },
  node: { __dirname: true },
  externalsPresets: { node: true },
  externals: async ({ request }: { request?: string }) => {
    if (/^[^.][a-z\-0-9@/.]+$/.test(request ?? '')) return true;
    else return false;
  },
  cache: { type: 'filesystem' },
  devtool: devMode ? 'eval-cheap-module-source-map' : 'source-map',
  resolve: { extensions: ['.ts', '.js'] },
  stats: { preset: 'normal', colors: true },
  experiments: { topLevelAwait: true },
  watchOptions: {
    ignored: /dist|webpack\.config\.ts/,
  },
  plugins: [
    new EnvironmentPlugin({ WEBPACK: true }),
    new ForkTsCheckerPlugin({
      typescript: {
        diagnosticOptions: {
          semantic: true,
          syntactic: true,
        },
        configFile: path.resolve(__dirname, 'tsconfig.json'),
      },
      eslint: { enabled: true, files: './src/**/*.{ts,js}' },
    }),
    new BannerPlugin({
      banner: 'require("source-map-support").install();',
      raw: true,
      entryOnly: false,
    }),
  ],
  optimization: {
    emitOnErrors: false,
    runtimeChunk: true,
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: {
      chunks: 'all',
    },
    minimize: !devMode,
    minimizer: devMode ? undefined : [new TerserPlugin({ terserOptions: { mangle: false } })],
  },
  module: {
    rules: [
      { test: /\.jsx?$/, enforce: 'pre', loader: require.resolve('source-map-loader') },
      {
        test: /\.ts$/,
        loader: require.resolve('ts-loader'),
        options: { happyPackMode: true },
        include: path.resolve(__dirname, 'src'),
      },
      { test: /\.node$/, use: require.resolve('node-loader') },
      { test: /\.mjs$/, include: /node_modules/, type: 'javascript/auto' },
    ],
  },
};
