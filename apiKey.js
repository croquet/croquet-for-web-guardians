const apiKey = ''; // <-- insert your API key from https://croquet.io/keys here

export default { apiKey };

// NOTE: Croquet API keys are "client-side" keys
// and are safe to be checked into source control.
//
// They do NOT have to be kept secret. In your deployed web app,
// the key will be visible in the source code anyways.
// On the Croquet key site you can restrict a key to a specific domain.
// If someone else tries to use your key on a different domain,
// the Croquet server will reject the connection:
//
//     https://croquet.io/keys
