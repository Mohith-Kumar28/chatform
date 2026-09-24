-- 26 drafts and every published version move from 5s to 4s.
-- 8 checksums follow their draft; 1 left alone (draft already ahead of live).
UPDATE form_versions SET schema_json = REPLACE(REPLACE(REPLACE(REPLACE(schema_json, '"delaySec":5,', '"delaySec":4,'), '"delaySec":5}', '"delaySec":4}'), '"redirectDelaySec":5,', '"redirectDelaySec":4,'), '"redirectDelaySec":5}', '"redirectDelaySec":4}');
UPDATE forms SET working_schema = REPLACE(REPLACE(REPLACE(REPLACE(working_schema, '"delaySec":5,', '"delaySec":4,'), '"delaySec":5}', '"delaySec":4}'), '"redirectDelaySec":5,', '"redirectDelaySec":4,'), '"redirectDelaySec":5}', '"redirectDelaySec":4}');
UPDATE form_versions SET checksum = 'a1210f1295b5ff33458c1d94c338efff40e17df166b1103857b802b8d1d89c9b' WHERE id = 'ver_c948932bbac9';
UPDATE form_versions SET checksum = '6e562a19c6cef1387063fb6a8dd401850be4b161d6d3f61f6943c79d53f8e11b' WHERE id = 'ver_c6bbbe137f1c';
UPDATE form_versions SET checksum = 'fe9e7a902c0a926ea0905c33dac923255702bf539a6ce03f791b221e9a14053d' WHERE id = 'ver_c08a48932411';
UPDATE form_versions SET checksum = 'c01c9df117072abda91c0c9b7ce73d1d8db01f9182d0ad45bffe0e8ccaecf7f3' WHERE id = 'ver_demo0019';
UPDATE form_versions SET checksum = '638216ecb5b7ae377ddec8882b3551660e983c966940947b156b90a011ac317b' WHERE id = 'ver_9960fdd5ca4b';
UPDATE form_versions SET checksum = 'a4e35f80616eb5cdca4d7a00304eba556c4f900c332124565adf544b828644ed' WHERE id = 'ver_d36af80f3828';
UPDATE form_versions SET checksum = 'd6b22df4b1bdde58f4e6c68ccc6cbca722650778f2b378d6b78a35756dd504c4' WHERE id = 'ver_2cc377f6a753';
UPDATE form_versions SET checksum = '1583224694c062b0797988854bb8aa0697edc55a678ee17597615554a9efbe48' WHERE id = 'ver_60d68b791880';
