const crypto = require('crypto');
const fs = require('fs');

function OutputHash({
    manifestFiles = [],
    validateOutput = false,
    validateOutputRegex = /^.*$/,
} = {}) {
    this.manifestFiles = manifestFiles;
    this.validateOutput = validateOutput;
    this.validateOutputRegex = validateOutputRegex;
}

function reHashChunk(chunk, assets, hashFn) {
    const oldHash = chunk.renderedHash;
    const oldChunkName = chunk.files[0];
    const asset = assets[oldChunkName];
    const { fullHash, shortHash } = hashFn(asset.source());
    const newChunkName = oldChunkName.replace(oldHash, shortHash);

    // Update the chunk with the new name
    chunk.hash = fullHash;
    chunk.renderedHash = shortHash;
    chunk.files[0] = newChunkName;

    // Update the asset associated with that chunk
    asset._name = newChunkName;
    delete assets[oldChunkName];
    assets[newChunkName] = asset;

    return {
        oldHash,
        newHash: shortHash,
    };
}

function replaceHashes(chunk, assets, nameMap) {
    const asset = assets[chunk.files[0]];

    // Replace references to the old chunk names with the new names
    Object.keys(nameMap).forEach((oldHash) => {
        const newHash = nameMap[oldHash];

        if ('_cachedSource' in asset) {
            asset._cachedSource = asset.source().replace(oldHash, newHash);
        } else if ('_value' in asset) {
            asset._value = asset.source().replace(oldHash, newHash);
        } else {
            throw new Error(`Unknown asset type (${asset.constructor.name})!. ` +
                'Unfortunately this type of asset is not supported yet. ' +
                'Please raise an issue and we will look into it asap');
        }
    });
}

OutputHash.prototype.apply = function apply(compiler) {
    let hashFn;

    compiler.plugin('compilation', (compilation) => {
        const { outputOptions } = compilation;
        const { hashFunction, hashDigest, hashDigestLength, hashSalt } = outputOptions;

        // Reuses webpack options
        hashFn = (input) => {
            const hashObj = crypto.createHash(hashFunction).update(input);
            if (hashSalt) hashObj.update(hashSalt);
            const fullHash = hashObj.digest(hashDigest);
            return { fullHash, shortHash: fullHash.substr(0, hashDigestLength) };
        };

        // Webpack does not pass chunks and assets to any compilation step, but we need both.
        // To get them, we hook into 'optimize-chunk-assets' and save the chunks for processing
        // them later.
        compilation.plugin('optimize-chunk-assets', (chunks, done) => {
            this.chunks = chunks;
            done();
        });

        compilation.plugin('optimize-assets', (assets, done) => {
            const nameMap = {};

            this.chunks
                // We assume that only the manifest chunk has references to all the other chunks.
                // It needs to be processed at the end, when we know the new names of all the other
                // chunks.
                .filter(chunk => !this.manifestFiles.includes(chunk.name))
                .forEach((chunk) => {
                    const { newHash, oldHash } = reHashChunk(chunk, assets, hashFn);
                    nameMap[oldHash] = newHash;
                });

            this.chunks
                // Now that we are done with all non-manifest chunks, process the manifest files
                .filter(chunk => this.manifestFiles.includes(chunk.name))
                .forEach((chunk) => {
                    replaceHashes(chunk, assets, nameMap);
                    reHashChunk(chunk, assets, hashFn);
                });

            done();
        });
    });

    if (this.validateOutput) {
        compiler.plugin('after-emit', (compilation, callback) => {
            let err;
            Object.keys(compilation.assets)
                .filter(assetName => assetName.match(this.validateOutputRegex))
                .forEach((assetName) => {
                    const asset = compilation.assets[assetName];
                    const path = asset.existsAt;
                    const assetContent = fs.readFileSync(path, 'utf8');
                    const { shortHash } = hashFn(assetContent);
                    if (!assetName.includes(shortHash)) {
                        err = new Error(`The hash in ${assetName} does not match the hash of the content (${shortHash})`);
                    }
                });
            return callback(err);
        });
    }
};

module.exports = OutputHash;
