const OutputHash = require('../../src/OutputHash.js');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const rel = (paths => path.resolve(__dirname, ...paths));

module.exports = {
    entry: {
        entry: rel`./entry.js`,
        vendor: rel`./vendor.js`,
    },
    output: {
        path: rel`../tmp`,
        filename: '[name].[chunkhash].js',
    },
    plugins: [
        new OutputHash({
            manifestFiles: ['vendor'],
        }),

        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor',
            filename: '[name].[chunkhash].js',
        }),

        new HtmlWebpackPlugin({
            filename: 'index.html',
            chunks: ['vendor', 'entry'],
        }),
    ],
};

