import compose from 'koa-compose';
import _ from 'lodash'
import monitor from 'monitor-dog'
import { dbAdapter, PubSub as pubSub } from '../../../models'
import { serializeSelfUser, serializeUser } from '../../../serializers/v2/user'
import { monitored, authRequired } from '../../middlewares';


export default class UsersController {
  static async blockedByMe(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const banIds = await ctx.state.user.getBanIds()
    const bannedUsers = await dbAdapter.getUsersByIds(banIds)
    const profilePicsPromises = bannedUsers.map(async (user) => {
      const request = _.pick(user, ['id', 'username', 'screenName'])
      request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl()
      request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl()
      return request
    })
    const result = await Promise.all(profilePicsPromises)
    ctx.body = result
  }

  static async getUnreadDirectsNumber(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('users.unread-directs')

    try {
      const unreadDirectsNumber = await dbAdapter.getUnreadDirectsNumber(ctx.state.user.id)
      ctx.body = { unread: unreadDirectsNumber };
      monitor.increment('users.unread-directs-requests')
    } finally {
      timer.stop()
    }
  }

  static async getUnreadNotificationsNumber(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const unreadNotificationsNumber = await dbAdapter.getUnreadEventsNumber(ctx.state.user.id);
    ctx.body = { unread: unreadNotificationsNumber };
  }

  static async markAllDirectsAsRead(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    await dbAdapter.markAllDirectsAsRead(ctx.state.user.id)
    await pubSub.updateUnreadDirects(ctx.state.user.id);
    ctx.body = { message: `Directs are now marked as read for ${ctx.state.user.id}` };
  }

  static async markAllNotificationsAsRead(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    await dbAdapter.markAllEventsAsRead(ctx.state.user.id);
    await pubSub.updateUnreadNotifications(ctx.state.user.intId);
    ctx.body = { message: `Notifications are now marked as read for ${ctx.state.user.id}` };
  }

  static whoAmI = compose([
    authRequired(),
    monitored({
      timer:    'users.whoami-v2',
      requests: 'users.whoami-v2-requests'
    }),
    async (ctx) => {
      const { user } = ctx.state;

      const [
        users,
        timelinesUserSubscribed,
        subscribersUIDs, // UIDs of users subscribed to the our user
        pendingSubscriptionRequestsUIDs,
        subscriptionRequestsUIDs,
        managedGroupUIDs,
        pendingGroupRequests,
        archiveParams,
      ] = await Promise.all([
        serializeSelfUser(user),
        dbAdapter.getTimelinesUserSubscribed(user.id, 'Posts'),
        user.getSubscriberIds(),
        user.getPendingSubscriptionRequestIds(),
        user.getSubscriptionRequestIds(),
        dbAdapter.getManagedGroupIds(user.id),
        dbAdapter.getPendingGroupRequests(user.id),
        dbAdapter.getUserArchiveParams(user.id),
      ]);

      if (archiveParams) {
        users.privateMeta.archives = archiveParams;
      }

      const subscriptions = timelinesUserSubscribed.map((t) => ({ id: t.id, name: t.name, user: t.userId }));
      const subscriptionsUIDs = _.map(subscriptions, 'user'); // UIDs of users our user subscribed to
      const groupRequestersUIDs = [].concat(...Object.values(pendingGroupRequests));

      const allUIDs = _.union(
        subscribersUIDs,
        subscriptionsUIDs,
        pendingSubscriptionRequestsUIDs,
        subscriptionRequestsUIDs,
        managedGroupUIDs,
        groupRequestersUIDs,
      );

      const [
        allUsers,
        allStats,
      ] = await Promise.all([
        dbAdapter.getUsersByIdsAssoc(allUIDs),
        dbAdapter.getUsersStatsAssoc(allUIDs),
      ]);
      const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds(_.map(_.filter(allUsers, { type: 'group' }), 'id'));

      const fillUser = getUserFiller(allUsers, allStats, allGroupAdmins);

      users.pendingGroupRequests = groupRequestersUIDs.length > 0;
      users.pendingSubscriptionRequests = pendingSubscriptionRequestsUIDs;
      users.subscriptionRequests = subscriptionRequestsUIDs;
      users.subscriptions = _.map(timelinesUserSubscribed, 'id');
      users.subscribers = subscribersUIDs.map(fillUser);
      const subscribers = subscriptionsUIDs.map(fillUser);
      const requests = _.union(pendingSubscriptionRequestsUIDs, subscriptionRequestsUIDs).map(fillUser);
      const managedGroups = managedGroupUIDs
        .map(fillUser)
        .map((group) => {
          group.requests = (pendingGroupRequests[group.id] || []).map(fillUser);
          return group;
        });

      ctx.body = { users, subscribers, subscriptions, requests, managedGroups };
    },
  ]);
}

const defaultStats = {
  posts:         '0',
  likes:         '0',
  comments:      '0',
  subscribers:   '0',
  subscriptions: '0',
};

function getUserFiller(allUsers, allStats, allGroupAdmins = {}) {
  return (id) => {
    const obj = serializeUser(allUsers[id]);
    obj.statistics = allStats[id] || defaultStats;

    if (obj.type === 'group') {
      obj.administrators = allGroupAdmins[obj.id] || [];
    }

    return obj;
  };
}
