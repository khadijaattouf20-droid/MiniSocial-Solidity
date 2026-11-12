
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MiniSocial {
    struct Post {
        string message;
        address author;
    }

    Post[] public posts;

    function publishPost(string memory _message) public {
        posts.push(Post(_message, msg.sender));
    }

    function getPost(uint index)
        public
        view
        returns (string memory, address)
    {
        require(index < posts.length, "Post inexistant");

        Post memory post = posts[index];
        return (post.message, post.author);
    }

    function getTotalPosts() public view returns (uint) {
        return posts.length;
    }
}