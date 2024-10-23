class Annonce {
    constructor(title, body, regionId, timestamp, checksum, url, cvr, homepage, possible_duplicate, body_hash, companyUrlFromAnnonce) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.url = url;
        this.cvr = cvr;
        this.homepage = homepage;
        this.possible_duplicate = possible_duplicate;
        this.body_hash = body_hash;
        this.companyUrlFromAnnonce = companyUrlFromAnnonce;
    }
}
module.exports = Annonce;
