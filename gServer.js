

// ------------ belwos 9is test to console work -----------

const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const cors = require('cors'); 
const  {google}  = require('googleapis');
const axios = require('axios');
const fetch = require('node-fetch');

const bodyParser = require('body-parser');

// const Front_URL = 'http://localhost:3000'
const Front_URL = 'https://van-cam.vercel.app'


require('dotenv').config();

const app = express();
app.use(express.json());



app.use(cors({
  origin: `${Front_URL}`, // Allow requests from this origin
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// app.use(cors());

app.use(bodyParser.json({ limit: '50mb' }));  // Increase the limit as needed
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
    
    clientID: process.env.Client_ID, // Use environment variable for security
    clientSecret: process.env.Client_Secret, // Use environment variable for security
    callbackURL: `${process.env.Base_URL}/auth/google/callback`
  },


  function (accessToken, refreshToken, profile, done) {
    profile.accessToken = accessToken;
    return done(null, profile);
  }
));

// Serialize and deserialize user to store information in the session
passport.serializeUser((user, done) => {
  // console.log("Serializing userrr:", user); // Debugging line
  done(null, {
    id: user.id,
    accessToken: user.accessToken // Store additional information if needed
  });
});

passport.deserializeUser((obj, done) => {
  console.log("Deserializing user:", obj); // Debugging line
  done(null, obj);
});



// Routes
app.get('/auth/google',
  // passport.authenticate('google', { scope: ['profile', 'email'] })
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/photoslibrary',
  'https://www.googleapis.com/auth/photoslibrary.sharing'
  ] })
);




// Storing the access token in the session during authentication
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    req.session.accessToken = req.user.accessToken; // Store the access token in the session
    const userData = encodeURIComponent(JSON.stringify(req.user));
    res.redirect(`${Front_URL}/auth/callback?user=${userData}`);
  }
);



app.get('/profile', (req, res) => {
  console.log('Request object:', req); // Debugging line
  if (!req.isAuthenticated()) {
    console.log('User is not authenticated'); // Debugging line
    return res.redirect('/');
  }

  console.log('Authenticated user:', req.user); // Debugging line
  
  res.json(req.user);
});



// ------- below share album api test 6 0-== solve for again shareble link get ------

app.post('/api/share-album', async (req, res) => {
  try {
    const { albumId } = req.body; // Get albumId from request body
    const accessToken = req.headers.authorization?.split(' ')[1]; // Extract access token from headers

    // Step 1: Check if the album is already shared
    const checkShareUrl = `https://photoslibrary.googleapis.com/v1/albums/${albumId}`;
    
    const albumResponse = await axios.get(checkShareUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // const isShared = albumResponse.data.shareInfo?.shareableUrl;
    const isShared = albumResponse.data.shareInfo;

    if (isShared) {
      // If already shared, return the existing shareable link
      // return res.json({ message: 'Album is already shared!', shareableLink: isShared });
      return res.json({ message: 'Album is already shared!', shareInfo: isShared });
    }


    // Step 2: Share the album and get a shareable link
    const shareUrl = `https://photoslibrary.googleapis.com/v1/albums/${albumId}:share`;

    const shareResponse = await axios.post(
      shareUrl,
      {
        sharedAlbumOptions: {
          isCollaborative: true, // Allow others to add photos
          isCommentable: true    // Allow comments
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // const shareInfo = shareResponse.data.shareInfo;
    // const shareableLink = shareInfo.shareableUrl || 'No shareable link available';

    return res.json({ message: 'Album successfully shared!', shareInfo : shareResponse.data.shareInfo });

  } catch (error) {
    console.error('Error sharing album:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to share album', details: error.response?.data || error.message });
  }
});


// ---------- above is invite/get the shareable url user to ablum -----------------

// Endpoint to create a new album

app.post('/create-album', async (req, res) => {
  // Ensure req.body is not undefined
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing' });
  }

  const { title } = req.body;

  // Check if title is provided
  if (!title) {
    return res.status(400).json({ error: 'Album title is required' });
  }

  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const response = await axios.post(
      'https://photoslibrary.googleapis.com/v1/albums',
      {
        album: {
          title: title
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const create_data = response.data;
    res.json({ success: true, album: create_data });
  } catch (error) {
    console.error('Error creating album:', error);
    res.status(500).json({ error: 'Failed to create album' });
  }
});


// ----- above geting me join, but thorw erro for fethc shared ablusm side ------ bleos i sto solve this ------

app.post('/join-album', async (req, res) => {
  // Ensure req.body is not undefined
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing' });
  }

  const { shareToken } = req.body;

  // Check if shareToken is provided
  if (!shareToken) {
    return res.status(400).json({ error: 'Share token is required' });
  }

  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    // Try to fetch the list of shared albums to check if the album is already joined
    const sharedAlbumsResponse = await axios.get(
      'https://photoslibrary.googleapis.com/v1/sharedAlbums',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const sharedAlbums = sharedAlbumsResponse.data.sharedAlbums || [];

    // Check if the album with the given shareToken is already joined
    const joinedAlbum = sharedAlbums.find(album => album.shareInfo?.shareToken === shareToken);

    if (joinedAlbum) {
      return res.json({ success: true, message: 'Album is already joined', album: joinedAlbum.shareInfo });
    }
  } catch (error) {
    // If fetching shared albums fails, log the error but proceed to try joining the album
    console.error('Error fetching shared albums:', error);
  }

  try {
    // Make POST request to join the shared album using the share token
    const response = await axios.post(
      'https://photoslibrary.googleapis.com/v1/sharedAlbums:join',
      {
        shareToken: shareToken
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Send the joined album data back to the client
    const joinedAlbumData = response.data;
    res.json({ success: true, album: joinedAlbumData, message: 'Joined Album Successfully' });
  } catch (error) {
    console.error('Error joining shared album:', error);
    res.status(500).json({ error: 'Failed to join shared album' });
  }
});


// ---------- geting albums wihtout categorization ---(wroiking good ) ------
app.get('/albums', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1]; // Extract the token from the Authorization header

  console.log("Album get - access token: ", accessToken);

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    // Fetch albums from Google Photos API
    const response = await axios.get(`https://photoslibrary.googleapis.com/v1/albums`, {
      headers: {
        Authorization: `Bearer ${accessToken}` // Send the token in the request headers
      }
    });

    // Send the albums data back to the client
    res.json({ albums: response.data.albums });
    // res.json({ albums: response.data.albums });
  } catch (error) {
    console.error('Error fetching albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});



// 0------- test to get shared alubms -------

app.get('/shared-albums', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1]; // Extract the token from the Authorization header

  console.log("Shared Albums - access token: ", accessToken);

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    // Fetch shared albums from Google Photos API
    const response = await axios.get(`https://photoslibrary.googleapis.com/v1/sharedAlbums`, {
      headers: {
        Authorization: `Bearer ${accessToken}` // Send the token in the request headers
      }
    });

    // Send the shared albums data back to the client
    res.json({ sharedAlbums: response.data.sharedAlbums });
  } catch (error) {
    console.error('Error fetching shared albums:', error);
    res.status(500).json({ error: 'Failed to fetch shared albums' });
  }
});


// --------- abcve is workign great - but someitme timeout error - so belwo is to solve ---

app.post('/media-items/:albumId', async (req, res) => {
  const { albumId } = req.params;
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const response = await axios.post('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
      albumId: albumId,
      pageSize: 100
    }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 seconds timeout
    });

    res.json({ mediaItems: response.data.mediaItems });
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out');
      return res.status(504).json({ error: 'Request timed out' });
    }
    console.error('Error fetching media items:', error);
    res.status(500).json({ error: 'Failed to fetch media items' });
  }
});

// ------------------ bleos is test-------- to upload caputred photo-----

// Route to upload image bytes
app.post('/upload-image', async (req, res) => {
  const { image, albumId } = req.body;
  const accessToken = req.headers.authorization.split(' ')[1]; // Extract token from headers

  try {
    const uploadTokenResponse = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': 'image/png',
        'X-Goog-Upload-Protocol': 'raw'
      },
      body: image.split(',')[1]
    });

    if (!uploadTokenResponse.ok) {
      throw new Error(`Upload token request failed: ${uploadTokenResponse.statusText}`);
    }

    const uploadToken = await uploadTokenResponse.text();

    const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        newMediaItems: [
          {
            simpleMediaItem: {
              fileName: 'captured_image.png',
              uploadToken: uploadToken
            }
          }
        ],
        albumId: albumId
      })
    });

    if (!response.ok) {
      throw new Error(`Batch create request failed: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Endpoint to list existing albums


// --------- above is ablum fefcth -------------



// Logout route
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Start server
app.listen(5000, () => console.log('Server running on http://localhost:5000'));
