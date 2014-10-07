var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
var session = require('express-session');

// app.use(cookieParser('shhhh, very secret'));
app.use(session({
  secret:'stuff',
  resave: false,
  saveUninitialized: true
}));


function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('login');
  }
}

app.get('/', restrict,
function(req, res) {
  // res.redirect('index')
  res.render('index');
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});


app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/signup',
  function(req, res){
    new User(req.body).save().then(function(data){
      Users.add(data.attributes);
      login(req, res);
    }).catch(function(error){
      console.log("failed because:", error);// Do not need
    })
  })

app.get('/login',
function(req, res) {
  res.render('login');
});

app.post('/login',
  function(req,res){login(req, res)}
  );

app.get('/logout',
function(req, res){
  req.session.destroy();
  res.redirect('login');
})

var login = function(req, res){
  new User({username: req.body.username}).fetch().then(function(user){
    if(user){
      if(user.attributes.username === req.body.username && user.attributes.password === req.body.password){
        req.session.user = req.body.username;
        res.redirect('/');
      } else{
        // "WRONG USERNAME/PASSWORD"
        res.redirect('login')
      }
    }else{
      //USERNAME NOT FOUND
      res.redirect('/login')
    }
  })
}

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
