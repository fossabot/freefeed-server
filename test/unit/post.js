var models = require("../../app/models")
  , User = models.User
  , Post = models.Post

describe('Post', function() {
  beforeEach(function(done) {
    $database.flushdbAsync()
      .then(function() { done() })
  })

  describe('#create()', function() {
    var user

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { done() })
    })

    it('should create without error', function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id
      })

      post.create()
        .then(function(post) {
          post.should.be.an.instanceOf(Post)
          post.should.not.be.empty
          post.should.have.property('id')

          return post
        })
        .then(function(post) { return Post.findById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
    })

    it('should ignore whitespaces in body', function(done) {
      var body = '   Post body    '
      var post = new Post({
        body: body,
        userId: user.id
      })

      post.create()
        .then(function(post) { return Post.findById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.body.should.eql(body.trim())
        })
        .then(function() { done() })
    })

    it('should save valid post to users timeline', function(done) {
      var post = new Post({
        body: 'Post',
        userId: user.id
      })

      post.create()
        .then(function(post) { return post.getSubscribedTimelineIds() })
        .then(function(timelines) {
          timelines.should.not.be.empty
          timelines.length.should.eql(2)
        })
        .then(function() { done() })
    })

    it('should return no posts from blank timeline', function(done) {
      user.getRiverOfNewsTimeline()
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.be.empty
        })
        .then(function() { done() })
    })

    it('should return valid post from users timeline', function(done) {
      var post = new Post({
        body: 'Post',
        userId: user.id
      })

      post.create()
        .then(function(post) { return user.getRiverOfNewsTimeline() })
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          var newPost = posts[0]
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('body')
          newPost.body.should.eql(post.body)
        })
        .then(function() { done() })
    })

    it('should not create with empty body', function(done) {
      var post = new Post({
        body: '',
        userId: user.id
      })

      post.create()
        .catch(function(e) {
          e.message.should.eql("Invalid")
        })
        .then(function() { done() })
    })
  })

  describe('#findById()', function() {
    var user

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { done() })
    })

    it('should find post with a valid id', function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id
      })

      post.create()
        .then(function(post) { return Post.findById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
    })

    it('should not find post with a valid id', function(done) {
      var identifier = "post:identifier"

      Post.findById(identifier)
        .then(function(post) {
          $should.not.exist(post)
        })
        .then(function() { done() })
    })
  })
})
