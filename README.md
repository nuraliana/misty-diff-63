# Diff two texts faster — split variant

[![diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![Rank](https://make.fun/badge/diff-speed-01-run-20261126/nuraliana/misty-diff-63/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![Reward](https://make.fun/badge/diff-speed-01-run-20261126/nuraliana/misty-diff-63/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)

This is a faster drop-in replacement for make.fun's makefun-diff 1.0.0 that diffs texts line by line.
It splits both texts at unique-line anchors and runs an exact greedy Myers search inside each segment, so it returns byte-identical patches much faster than the reference implementation.
