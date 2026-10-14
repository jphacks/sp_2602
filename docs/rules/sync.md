# 同期点の進め方（まとめ役が進行・15分以内）

時刻は kit.config.json の milestones。目的は「全員が同じものを作っているか」を**動くもので**確かめること。

1. 全員、手元の作業を PR にしてマージ済みにしておく。
2. まとめ役が main を pull し、`MOCK=1` で DEMO.md を頭から操作する（画面共有）。
3. 各自 30 秒で「今の着手宣言の goal」と「次のステップ」を言う。まとめ役は DEMO.md と食い違っていないかだけ見る。
4. 溜まった change-request Issue を採否する（まとめ役が進め、契約として通るかは lead が判断。採用は lead が contracts/ と CHANGELOG を更新）。
5. 遅れているスライスは 緑/黄/赤。赤は「残りステップを切る → Stretch に落とす → 人を寄せる」の順で縮める。
6. 決まったことは録音から docs/requirements/decisions.md へ（meeting.md）。
