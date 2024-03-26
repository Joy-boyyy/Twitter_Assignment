const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });

    app.listen(3000, () => {
      console.log("We are in Server");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `SELECT following_user_id FROM follower INNER JOIN user ON user.user_id = follower.following_user_id WHERE user.username='${username}'`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

//authentication token

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//  TWITTER ACCESS VERIFICATION

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `select * from tweet INNER JOIN follower ON tweet.user_id=follower.following.following_user_id where
    tweet.tweet_id = '${tweetId}' and follower_user_id='${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `select * from user where username = '${username}'`;
  const userDBDetails = await db.get(getUserQuery);

  if (userDBDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `insert into user(username, password, name, gender) values('${username}','${hashedPassword}','${name}','${gender}')`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//API - 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `select * from user where username ='${username}';`;
  const userDbDetails = await db.get(getUserQuery);
  if (userDbDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password
    );

    if (isPasswordCorrect) {
      const payload = { username, userId: userDbDetails.user_id };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API - 3


app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);

  const getTweetsFeedQuery = `SELECT username, tweet, date_time as dateTime from follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id INNER JOIN user ON user.user_id=follower.following_user_id
where follower.followers_user_id=${user_id}
ORDER BY date_time DESC LIMIT 4;
`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API - 4

app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowingUsersQuery = `select name from follower INNER JOIN user ON user.user_id = follower.following_user_id where follower_user_id=${userId};`;
  const followingPeople = await db.all(getFollowingUsersQuery);
  response.send(followingPeople);
});

//API-5

app.get("/user/followers/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowersQuery = `select distinct name from follower INNER JOIN user ON user.user_id =follower.follower_user_id where following_user_id=${userId};`;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

//API 6

app.get(
  "/tweets/:tweetID/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { payload } = request;
    const { tweetId } = request.params;

    const { user_id, name, username, gender } = payload;
    console.log(name, tweetId);
    const tweetsQuery = `select * from tweet where tweet_id=${tweetId}`;
    const tweetsResult = await db.get(tweetsQuery);
    const userFollowersQuery = `
select * from follower INNER JOIN user ON user.user_id = follower.following_user_id
where follower_user_id=${user_id};
`;

    const userFollowers = await db.all(userFollowersQuery);
    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetsResult.user_id
      )
    ) {
      console.log(tweetsResult);
      console.log(userFollowers);
      const getTweetDetailsQuery = `SELECT tweet, COUNT(DISTINCT(like.like_id)) as likes, 
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime FROM tweet INNER JOIN like ON tweet.tweet_id= like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
     WHERE tweet.tweet_id=${tweetId} and tweet.user_id=${userFollowers[0].user_id};`;
      const tweetDetails = await db.get(getTweetDetailsQuery);
      response.send(tweetDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `select username from user INNER JOIN like ON user.user_id=like.user_id where tweet_id = ${tweetId};`;
    const likedUsers = await db.all(getLikesQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
  }
);

//API-8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliedQuery = `SELECT name, reply FROM user INNER JOIN reply ON user.user_id=reply.user_id WHERE tweet_id = ${tweetId}`;

    const repliedUsers = await db.all(getRepliedQuery);
    response.send({ replies: repliedUsers });
  }
);

//API-9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { userId } = request;

const getTweetsQuery = `SELECT tweet, COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, date_time AS dateTime  
    FROM tweet 
    LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id 
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id 
    WHERE tweet.user_id=${userId} 
    GROUP BY tweet.tweet_id`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");

  const createTweetQuery = `INSERT INTO tweet(tweet, user_id, date_time)
    VALUES('${tweet}', ${userId}, '${dateTime}')`;

  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API - 11

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const getTheTweetQuery = `select * from tweet where user_id = ${userId} and tweet_id =${tweetId};`;
  const tweet = await db.get(getTheTweetQuery);
  console.log(tweet);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `DELETE from tweet where tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
