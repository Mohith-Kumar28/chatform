-- 135 drafts and every published version have Captcha switched off.
-- 25 checksums follow their draft; 5 left alone (draft already ahead of live).
UPDATE form_versions SET schema_json = REPLACE(schema_json, '"captcha":{"enabled":true,', '"captcha":{"enabled":false,');
UPDATE forms SET working_schema = REPLACE(working_schema, '"captcha":{"enabled":true,', '"captcha":{"enabled":false,');
UPDATE form_versions SET checksum = '1cf978cef83d64540cd8f2202a8eb3897419a5109e8c331533d0fee0b23a49b7' WHERE id = 'ver_c948932bbac9';
UPDATE form_versions SET checksum = 'c0d5495052523b17aefe6bc1d5fb23e905edfb034495a273a4a6cb4f4ae78833' WHERE id = 'ver_c6bbbe137f1c';
UPDATE form_versions SET checksum = '6585148df77b6c0604d1b5d4f23f464423a2380087dcb7fdceb24a913ca499c8' WHERE id = 'ver_demo0026';
UPDATE form_versions SET checksum = '84575d7693ddee27c2df5b461b639daee341ba5ce1ea14f386bb83158c6a0c2d' WHERE id = 'ver_9960fdd5ca4b';
UPDATE form_versions SET checksum = '68d356706e3009c43a642ea5e8cdd3cb4bc94ffbe10db61d9ba2b071907afbdb' WHERE id = 'ver_d36af80f3828';
UPDATE form_versions SET checksum = '93f401e454ce232b1afb4ed4aff84a4d560f8aee9ae08166154cd17a64b21550' WHERE id = 'ver_60d68b791880';
UPDATE form_versions SET checksum = '4b147c7a2ed0f58cf184f12f2cb2a414e036a818ae978fc289042777734ce897' WHERE id = 'ver_7b7bb9cbeef9';
UPDATE form_versions SET checksum = '72494cc31b154e5f66615a15fadb7579e78ef12e76430bc94ed59641d6c4a19e' WHERE id = 'ver_91bb499635e8';
UPDATE form_versions SET checksum = '735f2bb1f022da243cbb0bd23be790f3f5728f0b9ccf6f1d9c155ac9bb7dc743' WHERE id = 'ver_5a1dcc683b13';
UPDATE form_versions SET checksum = '623931f29347c0350cbe9edb631f90e47262e386747c774bce75f8807442d26f' WHERE id = 'ver_f5c1cfdf150b';
UPDATE form_versions SET checksum = '1e7b6046a2ab9a2cab81892d95081636a066c4ce27a94ebe76dfa4650c0915e1' WHERE id = 'ver_144da420116e';
UPDATE form_versions SET checksum = '15da455a1c230e2779c3ba562c4aae9e46ce189aae10cf4b78b36c1467229cde' WHERE id = 'ver_9e2094c7d42b';
UPDATE form_versions SET checksum = '79981493097f1f5651b5ddd813df9b7c13fedb39f4713bd665f1050504e3b7e9' WHERE id = 'ver_44b924460326';
UPDATE form_versions SET checksum = '45ecee09e8461bf4ed4d4dc2165928922ace7e428ee63cabc7ade473bb93ae5b' WHERE id = 'ver_52715fe8317f';
UPDATE form_versions SET checksum = 'b52a08a47da2bcb67011ff176f361dc615df36df9aaba7cf88986ba47de7bf2a' WHERE id = 'ver_7cc79273a622';
UPDATE form_versions SET checksum = 'e909f927de3132e689e758b52fd0edc36d17725849af9686af2a0e0880d43eba' WHERE id = 'ver_76a217699d78';
UPDATE form_versions SET checksum = '90da24d71ad10f36d6e9337c5fc24755dc56b53803839e5a4f0be7c2b70798f8' WHERE id = 'ver_ec78b263a5de';
UPDATE form_versions SET checksum = '636b7ddb8b6b141b9b44768a919f96e6655e3d78a6ed5f51a8874b4f070bf40f' WHERE id = 'ver_ecdf6d5719cc';
UPDATE form_versions SET checksum = 'aad7a0810d6b9de6fd18b1644304a4f7cf7ac5a8139ce4bc7818c133cfebe431' WHERE id = 'ver_59b54ac52150';
UPDATE form_versions SET checksum = 'ffa8ffe9452ddb85f18adea8330e375a7620cf38296d307e692c45dca13fbaaa' WHERE id = 'ver_0e3c2deb6a89';
UPDATE form_versions SET checksum = 'ffca533ab07f67c7c79617db3f1dd52c63d004886c68cbbc4417885ea239cfb5' WHERE id = 'ver_4f06d20eb475';
UPDATE form_versions SET checksum = 'b8b10e05f3f51fcdebc0f6774bbed5f7c82d7c1010685468ff5d128240db6874' WHERE id = 'ver_4c4bed88e145';
UPDATE form_versions SET checksum = 'cd9191d9cd65f8edc65bfec12b750571c250cbfbbfa5f2a57c9e7e9d31fc8afc' WHERE id = 'ver_41ddd4688a27';
UPDATE form_versions SET checksum = 'a02850a5c0d64082da6fe0a76f7ee3117fb3bec1e85e58d9f3782d68ad46129a' WHERE id = 'ver_fa934c044807';
UPDATE form_versions SET checksum = 'fe8f8716f28e07a9c18acd3574d8e330c1c24b7e3750c75f6fbff895ca3586d0' WHERE id = 'ver_d72dc928cebc';
