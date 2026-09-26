# The video renderer as a Cloud Run job: Node 22, Chromium and ffmpeg, with
# nothing from npm. Built from the repository root (it films the app in
# public/, with the scenes in tools/):
#
#   gcloud builds submit --config video/cloudbuild.yaml .
#
# See docs/operations/guide-videos.md.
FROM node:22-bookworm-slim

# Chromium to film the app and draw the stage; ffmpeg to encode. The fonts:
# Roboto is Android's own, Noto CJK has the full-width ＋ the app's buttons
# use, and Noto Color Emoji draws emoji the way the learners' Android phones
# do — most learners use one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates \
      fonts-roboto fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fontconfig \
 && rm -rf /var/lib/apt/lists/*
COPY video/fonts.conf /etc/fonts/local.conf

WORKDIR /app
COPY public/ public/
COPY tools/ tools/
COPY video/ video/
# the coach app's stand-in (tools/smoke/coach.mjs) plays this sample clip
COPY functions/test/sample.mp4 functions/test/sample.mp4

ENV CHROME=/usr/bin/chromium \
    VIDEO_OUT=/tmp/video-out \
    VIDEO_CACHE=/tmp/video-cache
ENTRYPOINT ["node", "video/render.mjs"]
CMD ["all", "--upload"]
