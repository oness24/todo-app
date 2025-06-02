const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: argv.mode || 'development',
    entry: './frontend/app.js',
    output: {
      filename: '[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    plugins: [
      new Dotenv({
        path: './.env',
        safe: './environment.example.frontend',
        systemvars: true,
        silent: true,
        defaults: './environment.defaults.frontend'
      }),
      new HtmlWebpackPlugin({
        template: './frontend/index.html',
        filename: 'index.html',
      }),
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css',
      }),
      new webpack.DefinePlugin({
        'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN_FRONTEND || process.env.SENTRY_DSN),
        'process.env.NODE_ENV': JSON.stringify(argv.mode || 'development'),
        'process.env.ENVIRONMENT': JSON.stringify(isProduction ? 'production' : 'development')
      })
    ],
    devServer: {
      static: {
          directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 8080,
      hot: true,
      historyApiFallback: true,
    },
    optimization: {
      splitChunks: {
          chunks: 'all',
      },
    },
  };
}; 