var models = require("../../models")
  , Serializer = models.Serializer
  , UserSerializer = models.UserSerializer
  , SubscriptionSerializer = models.SubscriptionSerializer
  , AttachmentSerializer = models.AttachmentSerializer
  , CommentSerializer = models.CommentSerializer

exports.addSerializer = function() {
  return new Serializer("posts", {
    select: ['id', 'body', 'attachments', 'createdBy', 'comments', 'createdAt', 'updatedAt', 'updatedAt', 'likes', 'isHidden', 'subscriptions'],
    attachments: { through: AttachmentSerializer, embed: true },
    createdBy: { through: UserSerializer, embed: true },
    comments: { through: CommentSerializer, embed: true },
    likes: { through: UserSerializer, embed: true },
    subscriptions: { through: SubscriptionSerializer, embed: true }
  })
}
