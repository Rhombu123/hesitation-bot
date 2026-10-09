create table if not exists "LeaderboardBoardPosts" (
  "guildId" text not null,
  "kind" text not null,
  "channelId" text not null,
  "messageId" text not null,
  "updatedAt" timestamptz not null default now(),
  primary key ("guildId", "kind")
);

create index if not exists "LeaderboardBoardPosts_channelId_idx"
  on "LeaderboardBoardPosts" ("channelId");
