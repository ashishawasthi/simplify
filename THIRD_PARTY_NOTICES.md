# Third-party notices

Everything in this repository is under its own MIT licence (`LICENSE`),
except the third-party material listed here.

## Noto Emoji

Most of the pictures in `public/img/pic/` (the picture set of Now and next, My
day, I need, Show a card and Steps, and the menu's icons) are from **Noto
Emoji** by Google, or contain parts of it:

- Source: <https://github.com/googlefonts/noto-emoji>, release `v2.051`
  (commit `8998f5dd683424a73e2314a8c1f1e359c19e8742`), folder `svg/`. On the
  current main branch the same folder is `2D/svg/`.
- Copyright, as upstream's `svg/LICENSE` states it:
  "Copyright 2013 Google, Inc. All Rights Reserved."
  (Upstream's `AUTHORS` file lists Google Inc. as the copyright holder.)
- Licence: **Apache License, Version 2.0** —
  <https://www.apache.org/licenses/LICENSE-2.0> (the full text is at the end of
  this file). This is the licence of the SVG images, stated by upstream's
  `svg/LICENSE` and its README ("Tools and most image resources are under the
  Apache license, version 2.0"). The Noto Emoji *fonts* are under the SIL Open
  Font License 1.1; no font is used here.
- Upstream has no `NOTICE` file.

**On the live site.** Hosting serves only `public/`, so this file never reaches
the people whose devices get the pictures. So that they get the licence and
the list of changes too (Apache-2.0 section 4(a) and (b)):

- `tools/make-pictures.mjs` writes `public/img/pic/LICENSE.txt`, served
  beside the pictures: the copyright line, what was changed, which file comes
  from which upstream file, and the full licence text (copied from the end of
  this file).
- Every picture with Noto in it has a one-line comment at the top naming its
  upstream file(s), the copyright and the licence, and saying what was changed.

**Changes made.** Every Noto file used was minified by `tools/make-pictures.mjs`:
comments, editor attributes and unused ids were removed, `style` attributes
became presentation attributes, repeated clip outlines became references, and
numbers were written more briefly. The minifier rounds nothing: a file taken
whole was renamed, and renders pixel for pixel like its upstream file.

### Files taken whole (minified and renamed)

| File in `public/img/pic/` | Upstream file (`svg/`) |
|---|---|
| `school.svg` | `emoji_u1f3eb.svg` |
| `walk.svg` | `emoji_u1f6b6.svg` |
| `car.svg` | `emoji_u1f697.svg` |
| `taxi.svg` | `emoji_u1f695.svg` |
| `lift.svg` | `emoji_u1f6d7.svg` |
| `snack.svg` | `emoji_u1f36a.svg` |
| `cook.svg` | `emoji_u1f373.svg` |
| `play.svg` | `emoji_u26bd.svg` |
| `playground.svg` | `emoji_u1f6dd.svg` |
| `park.svg` | `emoji_u1f333.svg` |
| `swim.svg` | `emoji_u1f3ca.svg` |
| `exercise.svg` | `emoji_u1f3c3.svg` |
| `music.svg` | `emoji_u1f3b5.svg` |
| `draw.svg` | `emoji_u1f3a8.svg` |
| `read.svg` | `emoji_u1f4d6.svg` |
| `homework.svg` | `emoji_u1f4dd.svg` |
| `library.svg` | `emoji_u1f4da.svg` |
| `computer.svg` | `emoji_u1f4bb.svg` |
| `tv.svg` | `emoji_u1f4fa.svg` |
| `game.svg` | `emoji_u1f3ae.svg` |
| `shop.svg` | `emoji_u1f6d2.svg` |
| `quiet-time.svg` | `emoji_u1f3a7.svg` |
| `doctor.svg` | `emoji_u1fa7a.svg` |
| `haircut.svg` | `emoji_u1f487.svg` |
| `toilet.svg` | `emoji_u1f6bd.svg` |
| `brush-teeth.svg` | `emoji_u1faa5.svg` |
| `shower.svg` | `emoji_u1f6bf.svg` |
| `get-dressed.svg` | `emoji_u1f455.svg` |
| `pack-bag.svg` | `emoji_u1f392.svg` |
| `clean-up.svg` | `emoji_u1f9f9.svg` |
| `sleep.svg` | `emoji_u1f6cc.svg` |
| `more-time.svg` | `emoji_u23f3.svg` |
| `changed.svg` | `emoji_u1f500.svg` |
| `all-done.svg` | `emoji_u2705.svg` |
| `help.svg` | `emoji_u1f64b.svg` |
| `break.svg` | `emoji_u1f6cb.svg` |
| `stop.svg` | `emoji_u1f6d1.svg` |
| `hurts.svg` | `emoji_u1f915.svg` |
| `want.svg` | `emoji_u1f449.svg` |
| `dont-understand.svg` | `emoji_u2753.svg` |
| `yes.svg` | `emoji_u1f44d.svg` |
| `no.svg` | `emoji_u1f44e.svg` |
| `seat.svg` | `emoji_u1f4ba.svg` |
| `bus-stop.svg` | `emoji_u1f68f.svg` |
| `receipt.svg` | `emoji_u1f9fe.svg` |
| `phone.svg` | `emoji_u1f4f1.svg` |
| `cannot-talk.svg` | `emoji_u270d.svg` |
| `please.svg` | `emoji_u1f64f.svg` |
| `thank-you.svg` | `emoji_u1f60a.svg` |
| `family.svg` | `emoji_u1f46a.svg` |
| `space.svg` | `emoji_u2194.svg` |
| `soap.svg` | `emoji_u1f9fc.svg` |
| `check-amount.svg` | `emoji_u1f440.svg` |
| `menu-now-next.svg` | `emoji_u27a1.svg` |
| `menu-steps.svg` | `emoji_u1f463.svg` |
| `menu-i-need.svg` | `emoji_u270b.svg` |
| `menu-show-card.svg` | `emoji_u1faaa.svg` |
| `menu-my-day.svg` | `emoji_u1f5d3.svg` |
| `menu-talk.svg` | `emoji_u1f4ac.svg` |

The `menu-*.svg` files are the menu's icons (`MENU_ICONS` in
`public/js/pictures.js`); the menu also uses `school.svg` and `more-time.svg`.

### Our drawings that contain Noto parts

These are our own drawings (MIT) with parts of the Noto files named here
placed in them — moved and scaled and, where it says so, mirrored, rotated or
cropped; otherwise unchanged. Those parts remain under the Apache License 2.0.

| File in `public/img/pic/` | Noto parts (upstream `svg/`) |
|---|---|
| `eat.svg` | `emoji_u1f37d.svg` (plate and fork; cropped, which cuts its knife away), `emoji_u1f944.svg` (spoon, rotated) |
| `recess.svg` | `emoji_u1f34e.svg` (apple) |
| `therapy.svg` | `emoji_u1f9d5.svg` (adult in a headscarf), `emoji_u1f9d2.svg` (child) |
| `tap-water.svg` | `emoji_u1faf3.svg` (hand, mirrored) |
| `wash-hands.svg` | `emoji_u1f932.svg` (hands) |
| `rub-hands.svg` | `emoji_u1faf1.svg` and `emoji_u1faf2.svg` (hands), `emoji_u1fae7.svg` (bubbles, one mirrored) |
| `dry-hands.svg` | `emoji_u1f91a.svg` (hand, one mirrored) |
| `carry-tray.svg` | `emoji_u1faf4.svg` (hand, one mirrored) |
| `wipe-table.svg` | `emoji_u1faf3.svg` (hand) |
| `too-loud.svg` | `emoji_u1f623.svg` (face), `emoji_u1f91a.svg` (hand, one mirrored) |
| `bell.svg` | `emoji_u1f448.svg` (hand) |

The other files in `public/img/pic/` are drawn for this project from scratch
(MIT): `home.svg`, `bus.svg`, `mrt-train.svg`, `travel-card.svg`,
`card-reader.svg`, `pay-qr.svg`, `tray.svg`, `tray-return.svg`,
`hawker-stall.svg`, `kopi.svg`, `water.svg`, `tablet.svg`.

`node tools/test-pictures.mjs` checks that this file, `public/img/pic/LICENSE.txt`
and the comment at the top of each picture name every Noto file used.

### Apache License, Version 2.0

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
