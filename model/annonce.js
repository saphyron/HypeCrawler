class Annonce {
    constructor(title, body, regionId, timestamp, checksum, url) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.url = url;
    }
}
module.exports = Annonce;
