const HtmlWebPackPlugin = require('html-webpack-plugin');
const HtmlMinimizerPlugin = require('html-minimizer-webpack-plugin');
const path = require('path');

module.exports = {
    entry: {
        game: './game.js',
        lobby: './lobby.js',
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: '[name]-[contenthash:8].js',
        chunkFilename: 'chunk-[name]-[contenthash:8].js',
    },
    devServer: {
        allowedHosts: 'all',
        port: 1234
    },
    resolve: {
       fallback: { "crypto": false }
    },
    experiments: {
        asyncWebAssembly: true,
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                enforce: "pre",
                use: ["source-map-loader"],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif|mp3|wav|ogg|fbx|otf|glb|gltf|avif|hdr|exr|aac)$/,
                loader: 'file-loader',
                options: {
                    name: '[contenthash:8].[ext]',
                },
            },
        ],
    },
    plugins: [
        new HtmlWebPackPlugin({
            template: 'game.html',
            filename: 'game.html',    // output filename in dist/
            chunks: ['game'],
        }),
        new HtmlWebPackPlugin({
            template: 'lobby.html',
            filename: 'index.html',   // output filename in dist/
            chunks: ['lobby'],
        }),
    ],
    optimization: {
        minimizer: [
          new HtmlMinimizerPlugin(),
        ],
    },
};
