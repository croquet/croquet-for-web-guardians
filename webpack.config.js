import HtmlWebPackPlugin from 'html-webpack-plugin';
import HtmlMinimizerPlugin from 'html-minimizer-webpack-plugin';
import CroquetPackage from '@croquet/croquet/package.json' with { type: "json" };
import apiKey from './apiKey.js';

const croquet_version = CroquetPackage.version;
const croquet_script = `<script src="https://cdn.jsdelivr.net/npm/@croquet/croquet@${croquet_version}"></script>`;
const api_key = JSON.stringify(apiKey, null, 4);

console.log(`Croquet v${croquet_version} API key: ${api_key}`);

export default async (_env, { mode }) => {
    const prod = mode === 'production';
    return {
        entry: {
            game: './game.js',
            lobby: './lobby.js',
        },
        output: {
            filename: '[name]-[contenthash:8].js',
            chunkFilename: 'chunk-[name]-[contenthash:8].js',
            clean: prod,
        },
        devtool: 'source-map',
        devServer: {
            allowedHosts: 'all',
            port: 1234
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
                    resolve: { fullySpecified: false },
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
        externals: {
            "./apiKey": "API_KEY",
            "@croquet/croquet": "Croquet",
        },
        plugins: [
            new HtmlWebPackPlugin({
                template: 'game.html',
                filename: 'game.html',    // output filename in dist/
                chunks: ['game'],
                templateParameters: { croquet_script, api_key },
            }),
            new HtmlWebPackPlugin({
                template: 'lobby.html',
                filename: 'index.html',   // output filename in dist/
                chunks: ['lobby'],
                templateParameters: { croquet_script, api_key },
            }),
        ],
        optimization: {
            minimizer: [
                new HtmlMinimizerPlugin(),
            ],
        },
    };
};
